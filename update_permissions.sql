-- Add page_book_session to Student, Super admin, Admin, Academics
UPDATE public."Role_Permissions"
SET pages = pages || '"page_book_session"'::jsonb
WHERE role IN ('Student', 'Super admin', 'Admin', 'Academics')
AND NOT pages ? 'page_book_session';
