-- Seed: test psychologist
INSERT INTO psychologists (name, email, password_hash)
VALUES ('Psicólogo Admin', 'admin@turnospsi.com', '8731434e2d45d05ad76f9485f37979a1:1046fc9dd3c2dd6bf3368e77eedb715cff1275d56a271ac9e193907c8e74dce2')
ON CONFLICT(email) DO NOTHING;
