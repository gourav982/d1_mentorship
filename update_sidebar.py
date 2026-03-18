import os
import glob

html_files = glob.glob('*.html')

old_link = '<a href="#" class="nav-item disabled">Book a Session <span class="coming-soon-tag">Coming Soon</span></a>'
new_link = '<a href="book-session.html" class="nav-item" data-permission="page_book_session">Book a Session</a>'

for file in html_files:
    with open(file, 'r') as f:
        content = f.read()
    
    if old_link in content:
        content = content.replace(old_link, new_link)
        with open(file, 'w') as f:
            f.write(content)
        print(f"Updated {file}")
