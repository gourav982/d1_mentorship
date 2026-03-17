import os
import glob
import re

html_files = glob.glob('*.html')
html_files = [f for f in html_files if f != 'index.html']

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Different formatting exists between admin-users and other files based on recent changes
    
    # 1. Look for Batch Performance without active state
    if 'data-permission="page_centre_analytics">Centre Analytics</a>' in content:
        new_link = '<a href="centre-analytics.html" class="nav-item" data-permission="page_centre_analytics">Centre Analytics</a>\n                            <a href="centre-test-summary.html" class="nav-item" data-permission="page_centre_test_summary">Test Summary</a>'
        # For the active case
        new_link_active_ca = '<a href="centre-analytics.html" class="nav-item active" data-permission="page_centre_analytics">Centre Analytics</a>\n                            <a href="centre-test-summary.html" class="nav-item" data-permission="page_centre_test_summary">Test Summary</a>'
        
        # In centre-analytics.html itself, it's active.
        content = content.replace('<a href="centre-analytics.html" class="nav-item active" data-permission="page_centre_analytics">Centre Analytics</a>', new_link_active_ca)
        
        content = content.replace('<a href="centre-analytics.html" class="nav-item" data-permission="page_centre_analytics">Centre Analytics</a>', new_link)
        
    # Deal with admin-users.html which has somewhat different indentation from recent changes
    elif 'data-permission="page_centre_analytics">Centre Analytics</a>' in content:
        # It's multi-line in admin-users.html
        pass # we can do regex

    # General Regex approach as fallback:
    pattern_ca_active = r'(<a href="centre-analytics\.html" class="nav-item active"[^>]*>Centre Analytics</a>)'
    pattern_ca_inactive = r'(<a href="centre-analytics\.html" class="nav-item"[^>]*>Centre Analytics</a>)'
    pattern_ca_admin = r'(<a href="centre-analytics\.html"\s*class="nav-item"\s*data-permission="page_centre_analytics">Centre Analytics</a>)'
    
    replacement = r'\1\n                            <a href="centre-test-summary.html" class="nav-item" data-permission="page_centre_test_summary">Test Summary</a>'
    
    if "Test Summary" not in content:
        content = re.sub(pattern_ca_active, replacement, content)
        if "Test Summary" not in content:
            content = re.sub(pattern_ca_inactive, replacement, content)
        if "Test Summary" not in content:
            content = re.sub(pattern_ca_admin, replacement, content)

    # Let's fix the active state in centre-test-summary.html
    if file == 'centre-test-summary.html':
        content = content.replace('class="nav-item active" data-permission="page_centre_analytics"', 'class="nav-item" data-permission="page_centre_analytics"')
        content = content.replace('class="nav-item" data-permission="page_centre_test_summary"', 'class="nav-item active" data-permission="page_centre_test_summary"')

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Updated all sidebar links")
