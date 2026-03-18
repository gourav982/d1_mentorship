import os
import glob
import re

html_files = glob.glob('*.html')
html_files = [f for f in html_files if f not in ['index.html', 'signup.html', 'admin-mentor-profile.html']]

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    if "admin-mentor-profile.html" not in content:
        pattern = r'(<a href="manage-centres\.html"[^>]*>Manage Centres</a>)'
        replacement = r'\1\n                                <a href="admin-mentor-profile.html" class="nav-item" data-permission="page_mentor_profile">Mentor Profile</a>'
        
        content = re.sub(pattern, replacement, content)
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
            
print("Updated all sidebar links for Mentor Profile")
