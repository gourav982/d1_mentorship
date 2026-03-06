document.addEventListener('DOMContentLoaded', async () => {
    const client = window.supabaseClient;
    if (!client) return;

    const { data: { session } } = await client.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    let roles = [];
    let centers = [];
    let rolePermissions = [];
    let roleCenters = [];
    let editingRoleId = null;
    let originalRoleName = null;

    const permissionStructure = [
        {
            section: 'Platform Access',
            categories: [
                {
                    name: 'Core Pages',
                    permissions: [
                        { key: 'page_dashboard', label: 'Performance Homepage', desc: 'Main student dashboard & charts' },
                        { key: 'page_schedule', label: 'Schedule Roadmap', desc: 'View classes and tests roadmap' },
                        { key: 'page_queries', label: 'Put your Query (Student)', desc: 'Access to post queries for students' },
                        { key: 'page_mentor_queries', label: 'Student\'s Query (Mentor)', desc: 'Mentor view to manage student queries' },
                        { key: 'page_student_performance', label: 'Student Performance (Mentor)', desc: 'Mentor view to search and see student stats' }
                    ]
                },
                {
                    name: 'Administrative Control',
                    permissions: [
                        { key: 'page_users', label: 'Users & Roles', desc: 'Manage user accounts and platform roles' },
                        { key: 'page_permissions', label: 'Role Permissions', desc: 'Access to this permission matrix' },
                        { key: 'page_manage_centres', label: 'Manage Centres', desc: 'CRUD operations for mentorship centres' }
                    ]
                },
                {
                    name: 'Data Uploads',
                    permissions: [
                        { key: 'page_upload_schedule', label: 'Upload Schedule', desc: 'Batch upload academic schedules' },
                        { key: 'page_upload_results', label: 'Upload Results', desc: 'Batch upload student marks' }
                    ]
                }
            ]
        }
    ];

    const thead = document.getElementById('permissions-thead');
    const tbody = document.getElementById('permissions-tbody');
    const roleForm = document.getElementById('role-form');
    const roleModal = document.getElementById('role-modal');
    const createRoleBtn = document.getElementById('create-role-btn');
    const saveBtn = document.getElementById('save-permissions-btn');
    const auditBtn = document.getElementById('view-audit-logs');
    const centreCheckboxesContainer = document.getElementById('centre-checkboxes');

    const nameDisplay = document.getElementById('display-name');
    const roleDisplay = document.getElementById('display-role');
    const avatarCircle = document.getElementById('avatar-circle');

    const fetchResilient = async (tableName, select = '*') => {
        let res = await client.from(tableName).select(select);
        if (res.error && (res.error.message?.includes('not find') || res.error.code === '42P01' || res.error.message?.includes('cache') || res.error.code === 'PGRST116')) {
            res = await client.from(tableName.toLowerCase()).select(select);
        }
        if (res.error) throw res.error;
        return res.data;
    };

    const logAction = async (type, role, details) => {
        try {
            const table = await checkTableCase('Audit_Logs', { silent: true });
            if (!table) return;

            await client.from(table).insert([{
                admin_email: session.user.email,
                action_type: type,
                target_role: role,
                details: typeof details === 'object' ? JSON.stringify(details) : details
            }]);
        } catch (err) {
            console.warn('Logging skipped:', err.message);
        }
    };

    const init = async () => {
        try {
            // Fetch Profile with resilience
            let { data: userData } = await client.from('Access').select('name, role').ilike('email_id', session.user.email).single();
            if (!userData) {
                // Secondary check for lowercase
                const { data: retryData } = await client.from('access').select('name, role').ilike('email_id', session.user.email).single();
                userData = retryData;
            }

            if (userData) {
                if (nameDisplay) nameDisplay.textContent = userData.name || 'Admin';
                if (roleDisplay) roleDisplay.textContent = userData.role || 'Super admin';
                if (avatarCircle) avatarCircle.textContent = (userData.name || 'A').charAt(0).toUpperCase();

                // Sidebar Sync
                await window.applyPermissions();

                // UI setup
                const sidebar = document.querySelector('.sidebar');
                const sidebarToggle = document.getElementById('sidebar-toggle-btn');
                if (sidebarToggle && sidebar) {
                    sidebarToggle.onclick = () => {
                        sidebar.classList.toggle('collapsed');
                        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
                    };
                    if (localStorage.getItem('sidebarCollapsed') === 'true') {
                        sidebar.classList.add('collapsed');
                    }
                }

                const adminRoles = ['Super admin', 'Admin', 'Mentor', 'Academics'];
                if (adminRoles.includes(userData.role)) {
                    document.getElementById('admin-section')?.style.setProperty('display', 'block');
                }
            } else {
                if (roleDisplay) roleDisplay.textContent = 'Account Profile Restricted';
            }

            const [rolesData, rolePermissionsData, centersData, roleCentersData] = await Promise.all([
                fetchResilient('User_Roles'),
                fetchResilient('Role_Permissions'),
                fetchResilient('Centres', 'name'),
                fetchResilient('Role_Centres').catch(() => [])
            ]);

            roles = rolesData.sort((a, b) => (a.id > b.id ? 1 : -1));
            rolePermissions = rolePermissionsData;
            centers = centersData;
            roleCenters = roleCentersData;

            renderMatrix();
        } catch (err) {
            console.error('Init Failure:', err);
            showSetupNotice(err.message || 'Check database connectivity.');
        }
    };

    const showSetupNotice = (details = '') => {
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 4rem; color: var(--text-secondary);">${details}</td></tr>`;
    };

    const renderMatrix = () => {
        if (!roles.length) return;
        const roleColWidth = roles.length > 0 ? (100 - 25) / roles.length : 0;

        let headerHtml = `<tr><th style="width: 25%; min-width: 300px; background: #0f172a; position: sticky; left: 0; z-index: 101;">SYSTEM PAGE ACCESS</th>`;
        roles.forEach(role => {
            const roleCentres = roleCenters.filter(rc => rc.role_name === role.name).map(rc => rc.centre_name);
            const centresBadge = roleCentres.length > 0
                ? `<div style="font-size: 0.6rem; color: #34d399; margin-top: 6px; background: rgba(52, 211, 153, 0.1); padding: 2px 6px; border-radius: 4px; display: inline-block; border: 1px solid rgba(52, 211, 153, 0.2); max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${roleCentres.join(', ')}">📍 ${roleCentres.join(', ')}</div>`
                : `<div style="font-size: 0.55rem; color: var(--text-secondary); margin-top: 6px; opacity: 0.5;">No centres assigned</div>`;

            headerHtml += `
                <th class="role-header-cell" style="width: ${roleColWidth}%; border-left: 1px solid rgba(255,255,255,0.05); background: #0f172a; text-align: center; vertical-align: top;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 0.5rem; width: 100%; min-height: 140px; padding: 0.75rem 0.5rem;">
                        <div style="width: 100%;">
                            <div class="role-name-display" style="font-weight: 700; color: #38bdf8; text-align: center; letter-spacing: 0.1em; font-size: 0.75rem;">${role.name.toUpperCase()}</div>
                            ${centresBadge}
                            <div class="role-desc-display" style="font-size: 0.6rem; color: var(--text-secondary); line-height: 1.4; white-space: pre-wrap; text-align: center; width: 100%; word-break: break-word; font-weight: 400; opacity: 0.7; margin-top: 8px;">
                                ${role.description || '&nbsp;'}
                            </div>
                        </div>
                        <button class="btn-edit-role" onclick="window.editRole('${role.id}', '${role.name}', '${(role.description || '').replace(/'/g, "\\'")}')" 
                             style="background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.2); color: var(--accent-color); font-size: 0.6rem; padding: 4px 10px; border-radius: 6px; cursor: pointer; transition: all 0.2s; margin-top: auto;">
                             Settings
                        </button>
                    </div>
                </th>
            `;
        });
        headerHtml += '</tr>';
        thead.innerHTML = headerHtml;

        let bodyHtml = '';
        permissionStructure[0].categories.forEach((cat, cIdx) => {
            bodyHtml += `
                <tr class="category-row" onclick="window.toggleSection('cat-${cIdx}')">
                    <td colspan="${roles.length + 1}" style="padding: 1rem 1.5rem; border-bottom: 2px solid rgba(56, 189, 248, 0.2); cursor: pointer;">
                        <div class="category-name">
                            <span class="chevron" id="chevron-cat-${cIdx}">▼</span>
                            📂 ${cat.name}
                        </div>
                    </td>
                </tr>
            `;

            cat.permissions.forEach(p => {
                bodyHtml += `
                    <tr class="permission-row cat-${cIdx}">
                        <td style="padding: 1rem 1.5rem; border-right: 1px solid rgba(255,255,255,0.05);">
                            <div class="permission-info">
                                <div class="permission-label" style="font-weight: 600; color: #fff; font-size: 0.9rem;">${p.label}</div>
                                <div class="permission-desc" style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 2px;">${p.desc}</div>
                            </div>
                        </td>
                `;

                roles.forEach(role => {
                    const isGranted = rolePermissions.some(rp => rp.role_name === role.name && rp.permission_key === p.key && rp.is_granted);
                    const isSuperAdmin = role.name === 'Super admin';

                    bodyHtml += `
                        <td class="checkbox-cell" style="border-left: 1px solid rgba(255,255,255,0.03);">
                            ${isSuperAdmin ?
                            `<div class="super-admin-check" style="color: var(--accent-color); font-size: 1.1rem; font-weight: bold; opacity: 1;">✓</div>` :
                            `<input type="checkbox" class="permission-checkbox" 
                                    data-role="${role.name}" 
                                    data-key="${p.key}"
                                    ${isGranted ? 'checked' : ''}>`
                        }
                        </td>
                    `;
                });
                bodyHtml += '</tr>';
            });
        });
        tbody.innerHTML = bodyHtml;
    };

    window.toggleSection = (id) => {
        const rows = document.querySelectorAll(`.${id}`);
        const chevron = document.getElementById(`chevron-${id}`);
        rows.forEach(row => row.classList.toggle('hidden'));
        chevron?.classList.toggle('collapsed');
    };

    window.toggleAllCentres = (check) => {
        document.querySelectorAll('.centre-access-cb').forEach(cb => cb.checked = check);
    };

    const renderCentreCheckboxes = (roleName, selectedCentres = []) => {
        if (!centreCheckboxesContainer) return;
        if (!centers.length) {
            centreCheckboxesContainer.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.8rem;">No centres found.</div>';
            return;
        }

        const isStudentsRole = roleName === 'Students';
        let html = '';

        if (isStudentsRole) {
            html += `
                <div style="grid-column: 1 / -1; background: rgba(56, 189, 248, 0.1); padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 0.5rem; border: 1px solid var(--accent-color);">
                    <p style="font-size: 0.75rem; color: var(--accent-color); font-weight: 600;">ℹ️ Student Access Rule Enabled</p>
                    <p style="font-size: 0.65rem; color: #fff; margin-top: 2px;">Users with the "Students" role will only see data for their <strong>assigned onboarding centre</strong>, regardless of the selections below.</p>
                </div>
            `;
        }

        html += `
            <div style="grid-column: 1 / -1; display: flex; justify-content: flex-end; margin-bottom: 0.5rem; gap: 0.75rem;">
                <button type="button" onclick="window.toggleAllCentres(true)" style="background:none; border:none; color:var(--accent-color); font-size:0.65rem; cursor:pointer; text-decoration:underline;">Select All</button>
                <button type="button" onclick="window.toggleAllCentres(false)" style="background:none; border:none; color:var(--text-secondary); font-size:0.65rem; cursor:pointer; text-decoration:underline;">Deselect All</button>
            </div>
        `;

        html += centers.map(c => `
            <div style="display: flex; align-items: center; gap: 0.6rem; background: rgba(15,23,42,0.4); padding: 0.6rem; border-radius: 0.6rem; border: 1px solid var(--glass-border);">
                <input type="checkbox" class="centre-access-cb" id="cb-${c.name}" value="${c.name}" ${selectedCentres.includes(c.name) ? 'checked' : ''}>
                <label for="cb-${c.name}" style="font-size: 0.75rem; color: #fff; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</label>
            </div>
        `).join('');

        centreCheckboxesContainer.innerHTML = html;
    };

    createRoleBtn.onclick = () => {
        editingRoleId = null;
        document.getElementById('modal-title').textContent = 'Create New Role';
        document.getElementById('modal-desc').textContent = 'Define a new set of permissions for platform users.';
        document.getElementById('modal-submit-btn').textContent = 'Create Role';
        roleForm.reset();
        renderCentreCheckboxes('', []);
        roleModal.classList.add('active');
    };

    window.editRole = (id, name, desc) => {
        editingRoleId = id;
        originalRoleName = name;
        document.getElementById('modal-title').textContent = `Edit Role: ${name}`;
        document.getElementById('role-name-input').value = name;
        document.getElementById('role-desc-input').value = (desc === 'null' || !desc) ? '' : desc;

        const selected = roleCenters.filter(rc => rc.role_name === name).map(rc => rc.centre_name);
        renderCentreCheckboxes(name, selected);
        roleModal.classList.add('active');
    };

    roleForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('modal-submit-btn');
        const name = document.getElementById('role-name-input').value;
        const desc = document.getElementById('role-desc-input').value;
        const selectedCentres = Array.from(document.querySelectorAll('.centre-access-cb:checked')).map(cb => cb.value);

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const rolesTable = await checkTableCase('User_Roles');
            const centresAccessTable = await checkTableCase('Role_Centres', { silent: true });
            const permsTable = await checkTableCase('Role_Permissions', { silent: true });

            if (editingRoleId) {
                const { error: upError } = await client.from(rolesTable).update({ name, description: desc }).eq('id', editingRoleId);
                if (upError) throw upError;

                if (originalRoleName && originalRoleName !== name && permsTable) {
                    const { data: oldPerms } = await client.from(permsTable).select('*').eq('role_name', originalRoleName);
                    if (oldPerms && oldPerms.length > 0) {
                        const newPerms = oldPerms.map(p => {
                            const { id, created_at, ...cleanPerm } = p;
                            return { ...cleanPerm, role_name: name };
                        });
                        await client.from(permsTable).delete().eq('role_name', originalRoleName);
                        await client.from(permsTable).insert(newPerms);
                    }
                }
                await logAction('ROLE_UPDATE', name, `Updated role: ${name}`);
            } else {
                const { error: insRoleError } = await client.from(rolesTable).insert([{ name, description: desc }]);
                if (insRoleError) throw insRoleError;
                await logAction('ROLE_CREATE', name, `Created role: ${name}`);
            }

            if (centresAccessTable) {
                // If the role name changed, we MUST use the OLD name for deletion
                // to clear stale records, then the NEW name for insertion.
                const deleteName = (editingRoleId && originalRoleName) ? originalRoleName : name;

                // 1. Clear OLD associations
                const { error: delError } = await client.from(centresAccessTable).delete().eq('role_name', deleteName);
                if (delError) {
                    console.error('Delete associations error:', delError);
                    throw new Error(`Sync Error (Delete): ${delError.message}`);
                }

                // 2. Insert NEW associations (using the updated role name)
                if (selectedCentres.length > 0) {
                    const inserts = selectedCentres.map(c => ({ role_name: name, centre_name: c }));
                    const { error: insError } = await client.from(centresAccessTable).insert(inserts);
                    if (insError) {
                        console.error('Insert associations error:', insError);
                        throw new Error(`Sync Error (Insert): ${insError.message}`);
                    }
                }
            }

            alert('Role saved successfully!');
            roleModal.classList.remove('active');
            init();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    };

    saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Updating Matrix...';
        const checkboxes = document.querySelectorAll('.permission-checkbox:not(:disabled)');
        const updates = Array.from(checkboxes).map(cb => ({
            role_name: cb.getAttribute('data-role'),
            permission_key: cb.getAttribute('data-key'),
            is_granted: cb.checked
        }));

        try {
            const targetTable = await checkTableCase('Role_Permissions');
            await client.from(targetTable).upsert(updates, { onConflict: 'role_name,permission_key' });
            await logAction('PERMISSION_SYNC', 'Platform', `Synchronized ${updates.length} permissions.`);
            alert('Permission matrix updated platform-wide!');
            init();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    };

    auditBtn.onclick = async () => {
        auditBtn.disabled = true;
        const originalText = auditBtn.textContent;
        auditBtn.textContent = 'Preparing CSV...';

        try {
            const table = await checkTableCase('Audit_Logs');
            const { data } = await client.from(table).select('*').order('created_at', { ascending: false });

            const headers = ['Timestamp (UTC)', 'Admin', 'Action', 'Target Role', 'Details'];
            let csvContent = headers.join(',') + '\n';

            if (data && data.length > 0) {
                data.forEach(row => {
                    const line = [
                        new Date(row.created_at).toISOString(),
                        `"${row.admin_email}"`,
                        `"${row.action_type}"`,
                        `"${row.target_role}"`,
                        `"${(row.details || '').replace(/"/g, '""')}"`
                    ];
                    csvContent += line.join(',') + '\n';
                });
            } else {
                csvContent += 'N/A,N/A,No logs found,N/A,N/A\n';
            }

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `mentorship_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            alert('Audit Export Error: ' + err.message);
        } finally {
            auditBtn.disabled = false;
            auditBtn.textContent = originalText;
        }
    };

    const checkTableCase = async (table, options = { silent: false }) => {
        try {
            const { error: err1 } = await client.from(table).select('*').limit(1);
            if (!err1) return table;

            const isMissing = (err) => err.message?.includes('not find') || err.message?.includes('cache') || err.code === '42P01' || err.code === 'PGRST116';

            if (isMissing(err1)) {
                const { error: err2 } = await client.from(table.toLowerCase()).select('*').limit(1);
                if (!err2) return table.toLowerCase();

                if (isMissing(err2)) {
                    if (options.silent) return null;
                    throw new Error(`Table '${table}' not found in Supabase.`);
                }
                throw err2;
            }
            throw err1;
        } catch (err) {
            if (options.silent) return null;
            throw err;
        }
    };

    init();
});
