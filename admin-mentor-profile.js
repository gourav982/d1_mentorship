document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let mentorAccessList = [];
    let onboardedMentors = [];
    let centresList = [];

    const mentorSelect = document.getElementById('mentor-select');
    const mentorCentreInp = document.getElementById('mentor-centre');
    const form = document.getElementById('mentor-profile-form');
    const bookSlotToggle = document.getElementById('book-slot-toggle');
    const enabledProfileToggle = document.getElementById('profile-enabled-toggle');
    const urlContainer = document.getElementById('url-container');
    const bookSlotUrlInp = document.getElementById('book-slot-url');
    const photoInput = document.getElementById('photo-input');
    const photoPreview = document.getElementById('photo-preview');
    const submitBtn = document.getElementById('process-upload-btn');
    const sortOrderInp = document.getElementById('mentor-order');
    const listBody = document.getElementById('mentor-list-body');
    const centreFilter = document.getElementById('centre-filter');

    // Make global for inline HTML onclicks 
    window.clearFormAndFocus = () => {
        form.reset();
        photoPreview.style.display = 'none';
        mentorSelect.value = '';
        bookSlotToggle.dispatchEvent(new Event('change'));
        mentorSelect.focus();
    };

    window.editMentorProfile = (email) => {
        mentorSelect.value = email;
        mentorSelect.dispatchEvent(new Event('change'));
        form.scrollIntoView({ behavior: 'smooth' });
    };

    // Init
    const init = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.replace('index.html');
            return;
        }

        // Instantly load from new sessionStorage cache token
        currentUser = await window.syncUserProfile(false);
        if (!currentUser || !['Super admin', 'Admin', 'Academics'].includes(currentUser.role)) {
            // No permission to view this
            window.location.replace('dashboard.html');
            return;
        }

        // Show UI after auth clears
        document.body.style.display = 'block';

        document.getElementById('display-name').textContent = currentUser.name || 'User';
        document.getElementById('display-role').textContent = currentUser.role || 'Member';
        document.getElementById('avatar-circle').textContent = (currentUser.name || 'U').charAt(0).toUpperCase();

        await window.applyPermissions();

        await fetchMentors();
    };

    const fetchMentors = async () => {
        try {
            // 1. Fetch anyone who has role "Mentor"
            const accRes = await supabaseClient
                .from('Access')
                .select('email_id, name, centre_name')
                .eq('role', 'Mentor');
            
            if (accRes.error) throw accRes.error;
            mentorAccessList = accRes.data || [];

            // 2. Fetch Centres
            const cntRes = await supabaseClient
                .from('Centres')
                .select('name')
                .order('name', { ascending: true });
            
            if (cntRes.error) throw cntRes.error;
            centresList = cntRes.data?.map(c => c.name) || [];
            
            const centreOptions = centresList.map(c => `<option value="${c}">${c}</option>`).join('');
            
            mentorCentreInp.innerHTML = '<option value="">Select Centre...</option>' + centreOptions;
            
            // Re-preserve the currently selected filter when re-fetching
            const currentFilter = centreFilter.value || 'all';
            centreFilter.innerHTML = '<option value="all">All Centres</option>' + centreOptions;
            centreFilter.value = currentFilter;

            // 3. Fetch existing profiles
            const profRes = await supabaseClient
                .from('mentor_profiles')
                .select('*')
                .order('sort_order', { ascending: true });

            if (profRes.error) throw profRes.error;
            onboardedMentors = profRes.data || [];

            renderDropdown();
            renderTable();

        } catch (error) {
            console.error(error);
            alert("Error loading mentors: " + error.message);
        }
    };

    const renderDropdown = () => {
        if (mentorAccessList.length === 0) {
            mentorSelect.innerHTML = `<option value="">No Mentors found in the system</option>`;
            return;
        }

        let optionsHtml = '<option value="">-- Choose target account --</option>';
        
        let onboarded = mentorAccessList.filter(m => onboardedMentors.some(op => op.mentor_email === m.email_id));
        let pending = mentorAccessList.filter(m => !onboardedMentors.some(op => op.mentor_email === m.email_id));
        
        if (pending.length > 0) {
            optionsHtml += '<optgroup label="Ready for Configuration">';
            optionsHtml += pending.map(m => `<option value="${m.email_id}">${m.name} (${m.centre_name || 'No Centre'})</option>`).join('');
            optionsHtml += '</optgroup>';
        }
        if (onboarded.length > 0) {
            optionsHtml += '<optgroup label="Active Profiles">';
            optionsHtml += onboarded.map(m => `<option value="${m.email_id}">${m.name} (${m.centre_name || 'No Centre'})</option>`).join('');
            optionsHtml += '</optgroup>';
        }

        mentorSelect.innerHTML = optionsHtml;
    };

    const renderTable = () => {
        const selectedCentre = centreFilter ? centreFilter.value : 'all';
        let displayList = onboardedMentors;

        if (selectedCentre && selectedCentre !== 'all') {
            displayList = displayList.filter(p => p.centre_name === selectedCentre);
        }

        if (displayList.length === 0) {
            listBody.innerHTML = `<tr><td colspan="4"><div class="empty-state">No configured mentor profiles for this selection.</div></td></tr>`;
            return;
        }

        listBody.innerHTML = displayList.map(profile => {
            // Primary centre name from profile schema
            const centerStr = profile.centre_name || 'No Centre';
            const badgeStr = profile.is_enabled !== false 
                ? `<span class="badge-active">Active</span>` 
                : `<span class="badge-inactive">Disabled</span>`;

            let avatarHtml = `<div class="mentor-thumb">${profile.name.charAt(0).toUpperCase()}</div>`;
            if (profile.photo_url) {
                const { data } = supabaseClient.storage.from('mentor_photos').getPublicUrl(profile.photo_url);
                if (data && data.publicUrl) {
                    avatarHtml = `<img class="mentor-thumb" src="${data.publicUrl}" alt="Avatar">`;
                }
            }

            return `
            <tr>
                <td>
                    <div class="mentor-cell">
                        ${avatarHtml}
                        <div>
                            <div class="mentor-name">${profile.name}</div>
                            <div class="mentor-centre">${centerStr}</div>
                        </div>
                    </div>
                </td>
                <td style="text-align: center; font-weight: bold; color: var(--accent-color);">${profile.sort_order || 0}</td>
                <td style="text-align: center;">${badgeStr}</td>
                <td style="text-align: right;">
                    <button class="btn-action" onclick="window.editMentorProfile('${profile.mentor_email}')">Edit</button>
                </td>
            </tr>
            `;
        }).join('');
    };

    // UI Filters & Toggles
    if (centreFilter) {
        centreFilter.addEventListener('change', renderTable);
    }

    bookSlotToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            urlContainer.style.display = 'block';
            bookSlotUrlInp.setAttribute('required', 'true');
        } else {
            urlContainer.style.display = 'none';
            bookSlotUrlInp.removeAttribute('required');
            bookSlotUrlInp.value = '';
        }
    });

    photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            photoPreview.src = url;
            photoPreview.style.display = 'block';
        } else {
            photoPreview.style.display = 'none';
            photoPreview.src = '';
        }
    });
    
    mentorSelect.addEventListener('change', async (e) => {
        const email = e.target.value;
        if (!email) {
            form.reset();
            photoPreview.style.display = 'none';
            bookSlotToggle.dispatchEvent(new Event('change'));
            return;
        }

        const selectedInfo = mentorAccessList.find(m => m.email_id === email);
        if (selectedInfo) {
            document.getElementById('mentor-name').value = selectedInfo.name;
            mentorCentreInp.value = selectedInfo.centre_name || '';
        }

        // See if already onboarded
        const existingProf = onboardedMentors.find(op => op.mentor_email === email);
        if (existingProf) {
            document.getElementById('mentor-name').value = existingProf.name;
            mentorCentreInp.value = existingProf.centre_name || selectedInfo?.centre_name || '';
            document.getElementById('mentor-subtitle').value = existingProf.subtitle || '';
            document.getElementById('mentor-intro').value = existingProf.intro || '';
            document.getElementById('mentor-achievements').value = existingProf.achievements || '';
            document.getElementById('mentor-languages').value = existingProf.languages || '';
            
            sortOrderInp.value = existingProf.sort_order || 0;
            enabledProfileToggle.checked = existingProf.is_enabled !== false; // defaults to true if missing

            if (existingProf.photo_url) {
                const { data: publicUrl } = supabaseClient.storage.from('mentor_photos').getPublicUrl(existingProf.photo_url);
                photoPreview.src = publicUrl.publicUrl;
                photoPreview.style.display = 'block';
            } else {
                photoPreview.src = '';
                photoPreview.style.display = 'none';
            }

            bookSlotToggle.checked = existingProf.book_slot_enabled === true;
            bookSlotToggle.dispatchEvent(new Event('change'));
            
            if (existingProf.book_slot_enabled) {
                bookSlotUrlInp.value = existingProf.book_slot_url || '';
            }
        } else {
            // New Configuration State Reset
            document.getElementById('mentor-subtitle').value = '';
            document.getElementById('mentor-intro').value = '';
            document.getElementById('mentor-achievements').value = '';
            document.getElementById('mentor-languages').value = '';
            sortOrderInp.value = 0;
            enabledProfileToggle.checked = true;
            bookSlotToggle.checked = false;
            bookSlotToggle.dispatchEvent(new Event('change'));
            photoPreview.style.display = 'none';
        }
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const mentorEmail = mentorSelect.value;
        const name = document.getElementById('mentor-name').value.trim();
        const subtitle = document.getElementById('mentor-subtitle').value.trim();
        const intro = document.getElementById('mentor-intro').value.trim();
        const achievements = document.getElementById('mentor-achievements').value.trim();
        const languages = document.getElementById('mentor-languages').value.trim();
        const sortOrder = parseInt(sortOrderInp.value, 10) || 0;
        const isEnabled = enabledProfileToggle.checked;
        const bookEnabled = bookSlotToggle.checked;
        const bookUrl = bookSlotUrlInp.value.trim();
        const photoFile = photoInput.files[0];

        if (!mentorEmail) {
            alert('Please select a target mentor account.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Recording Configured Profile...';

        try {
            let uploadedFilePath = null;

            // 1. Upload photo if provided
            if (photoFile) {
                const fileExt = photoFile.name.split('.').pop();
                const fileName = `${mentorEmail.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('mentor_photos')
                    .upload(`avatars/${fileName}`, photoFile, {
                        cacheControl: '3600',
                        upsert: true
                    });

                if (uploadError) throw uploadError;
                uploadedFilePath = uploadData.path;
            }

            const existingProfile = onboardedMentors.find(op => op.mentor_email === mentorEmail);
            const finalPhotoPath = uploadedFilePath || (existingProfile ? existingProfile.photo_url : null);

            const centreName = mentorCentreInp.value;

            const payload = {
                mentor_email: mentorEmail,
                name: name,
                centre_name: centreName,
                subtitle: subtitle,
                intro: intro,
                achievements: achievements,
                languages: languages,
                sort_order: sortOrder,
                is_enabled: isEnabled,
                photo_url: finalPhotoPath,
                book_slot_enabled: bookEnabled,
                book_slot_url: bookEnabled ? bookUrl : null,
                updated_at: new Date().toISOString()
            };

            if (existingProfile) {
                // UPDATE
                const { error } = await supabaseClient
                    .from('mentor_profiles')
                    .update(payload)
                    .eq('id', existingProfile.id);
                if (error) throw error;
            } else {
                // INSERT
                const { error } = await supabaseClient
                    .from('mentor_profiles')
                    .insert(payload);
                if (error) throw error;
            }

            // Success, reset form and refetch to update UI
            alert("Mentor profile configuration successful!");
            window.clearFormAndFocus();
            await fetchMentors();
            
        } catch(err) {
            console.error(err);
            alert("Error: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Profile Document';
        }
    });

    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle-btn');
    if (window.innerWidth <= 1024) sidebar?.classList.add('collapsed');
    sidebarToggle?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));

    const profileBtn = document.getElementById('user-profile-btn');
    profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileBtn.classList.toggle('active');
    });
    document.addEventListener('click', () => profileBtn?.classList.remove('active'));

    init();
});
