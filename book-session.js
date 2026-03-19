document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let availableMentors = [];

    const mentorsContainer = document.getElementById('mentors-container');
    const headerText = document.getElementById('centre-header-text');

    const init = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.replace('index.html');
            return;
        }

        // Instantly load from new sessionStorage cache token
        currentUser = await window.syncUserProfile(false);
        if (!currentUser) {
            window.location.replace('dashboard.html');
            return;
        }

        // Display UI
        document.body.style.display = 'block';

        document.getElementById('display-name').textContent = currentUser.name || 'User';
        document.getElementById('display-role').textContent = currentUser.role || 'Member';
        document.getElementById('avatar-circle').textContent = (currentUser.name || 'U').charAt(0).toUpperCase();

        await window.applyPermissions();

        const isStudentRecord = currentUser.role && currentUser.role.toLowerCase().includes('student');

        if (isStudentRecord && !currentUser.centre_name) {
            mentorsContainer.innerHTML = `<div class="empty-state">No centre assigned to your account.</div>`;
            headerText.textContent = "Please contact administration to assign a centre.";
            return;
        }
        
        const targetCentre = currentUser.centre_name || 'DBMCI Delhi';
        headerText.textContent = `Available Mentors for ${targetCentre}`;

        // Enable centre toggle for non-students
        if (!isStudentRecord) {
            document.getElementById('centre-toggle-container').style.display = 'flex';
            await loadCentresDropdown(targetCentre);
            
            document.getElementById('centre-filter').addEventListener('change', async (e) => {
                const newCentre = e.target.value;
                if(newCentre) {
                    headerText.textContent = `Available Mentors for ${newCentre}`;
                    await fetchMentors(newCentre);
                }
            });
        }

        await fetchMentors(targetCentre);
    };

    const loadCentresDropdown = async (currentCentre) => {
        const filterDropdown = document.getElementById('centre-filter');
        try {
            const { data, error } = await supabaseClient.from('Centres').select('name').order('name', { ascending: true });
            if (error) throw error;
            filterDropdown.innerHTML = data.map(c => 
                `<option value="${c.name}" ${c.name === currentCentre ? 'selected' : ''}>${c.name}</option>`
            ).join('');
        } catch (error) {
            console.error('Error loading centres:', error);
            filterDropdown.innerHTML = `<option value="${currentCentre}">${currentCentre}</option>`;
        }
    };

    const fetchMentors = async (targetCentre) => {
        try {
            const { data, error } = await supabaseClient
                .from('mentor_profiles')
                .select('*')
                .eq('centre_name', targetCentre)
                .eq('is_enabled', true)
                .order('sort_order', { ascending: true });

            if (error) throw error;
            availableMentors = data || [];
            
            renderMentors();
        } catch (error) {
            console.error(error);
            mentorsContainer.innerHTML = `<div class="empty-state">Error loading mentors: ${error.message}</div>`;
        }
    };

    const renderMentors = () => {
        if (availableMentors.length === 0) {
            mentorsContainer.innerHTML = `<div class="empty-state">No active mentor profiles available for your centre yet.</div>`;
            return;
        }

        mentorsContainer.innerHTML = availableMentors.map(profile => {
            let avatarHtml = `<div class="mentor-photo-wrapper">${profile.name.charAt(0).toUpperCase()}</div>`;
            
            if (profile.photo_url) {
                const { data } = supabaseClient.storage.from('mentor_photos').getPublicUrl(profile.photo_url);
                if (data && data.publicUrl) {
                    avatarHtml = `<div class="mentor-photo-wrapper"><img src="${data.publicUrl}" alt="${profile.name}"></div>`;
                }
            }

            const achievementHtml = profile.achievements 
                ? `<div class="mentor-meta-group">
                       <span class="mentor-meta-label">Achievements:</span>
                       <div class="mentor-meta-row achievements-row" title="${profile.achievements.replace(/"/g, '&quot;')}">
                           <span class="mentor-meta-value">${profile.achievements}</span>
                       </div>
                   </div>` 
                : `<div class="mentor-meta-group" style="opacity: 0.4;">
                       <span class="mentor-meta-label">Achievements:</span>
                       <div class="mentor-meta-row achievements-row">
                           <span class="mentor-meta-value">-</span>
                       </div>
                   </div>`;

            const languageHtml = profile.languages 
                ? `<div class="mentor-meta-group">
                       <span class="mentor-meta-label">Languages:</span>
                       <div class="mentor-meta-row languages-row" title="${profile.languages.replace(/"/g, '&quot;')}">
                           <span class="mentor-meta-value">${profile.languages}</span>
                       </div>
                   </div>` 
                : `<div class="mentor-meta-group" style="opacity: 0.4;">
                       <span class="mentor-meta-label">Languages:</span>
                       <div class="mentor-meta-row languages-row">
                           <span class="mentor-meta-value">-</span>
                       </div>
                   </div>`;
                
            const bookButton = profile.book_slot_enabled && profile.book_slot_url
                ? `<a href="${profile.book_slot_url}" target="_blank" class="btn-book-session">Book a Session</a>`
                : `<button class="btn-book-session disabled-btn" disabled>Book a Session <span class="coming-soon-tag">Coming Soon</span></button>`;

            const showReadMore = profile.intro && profile.intro.length > 150;
            const readMoreHtml = showReadMore 
                ? `<div class="read-more-btn" onclick="window.openIntroModal('${profile.mentor_email}')">Read more</div>`
                : '';

            return `
                <div class="mentor-card">
                    <div class="mentor-card-header">
                        ${avatarHtml}
                        <div class="mentor-header-info">
                            <h2 class="mentor-name">${profile.name}</h2>
                            <div class="mentor-designation">${profile.subtitle || 'Mentor'}</div>
                        </div>
                    </div>
                    
                    <div class="mentor-meta-container">
                        ${achievementHtml}
                        ${languageHtml}
                        
                        <div class="mentor-meta-group" style="margin-top: 0.25rem;">
                            <span class="mentor-meta-label">About:</span>
                            <div class="mentor-intro-box" title="${(profile.intro || '').replace(/"/g, '&quot;')}">
                                <div class="mentor-intro">${profile.intro || 'No introduction provided.'}</div>
                                ${readMoreHtml}
                            </div>
                        </div>
                    </div>

                    <div class="mentor-action">
                        ${bookButton}
                    </div>
                </div>
            `;
        }).join('');
    };

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

    // Modal Global Handlers
    window.openIntroModal = (email) => {
        const profile = availableMentors.find(p => p.mentor_email === email);
        if(!profile) return;
        document.getElementById('modal-mentor-name').textContent = profile.name;
        document.getElementById('modal-mentor-designation').textContent = profile.subtitle || 'Mentor';
        document.getElementById('modal-mentor-intro').textContent = profile.intro || 'No introduction provided.';
        document.getElementById('intro-modal').classList.add('active');
    };

    window.closeIntroModal = () => {
        document.getElementById('intro-modal').classList.remove('active');
    };

    const introModal = document.getElementById('intro-modal');
    if (introModal) {
        introModal.addEventListener('click', (e) => {
            if (e.target.id === 'intro-modal') {
                window.closeIntroModal();
            }
        });
    }

    init();
});
