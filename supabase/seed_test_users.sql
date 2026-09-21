-- Seed de 2 comptes de test (email confirmé, mot de passe utilisable immédiatement).
-- Ne fait pas partie des migrations versionnées : à exécuter manuellement, une seule fois.
do $$
declare
  v_user_id uuid;
  v_email text;
  v_password text;
  v_nom text;
  v_ville text;
  v_pays text;
  test_accounts jsonb := '[
    {"email": "test1@maison2d.dev", "password": "Test1234!", "nom": "Alice Rakoto", "ville": "Antananarivo", "pays": "Madagascar"},
    {"email": "test2@maison2d.dev", "password": "Test1234!", "nom": "Bob Andria", "ville": "Toamasina", "pays": "Madagascar"}
  ]';
  account jsonb;
begin
  for account in select * from jsonb_array_elements(test_accounts)
  loop
    v_email := account ->> 'email';
    v_password := account ->> 'password';
    v_nom := account ->> 'nom';
    v_ville := account ->> 'ville';
    v_pays := account ->> 'pays';
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('nom', v_nom, 'ville', v_ville, 'pays', v_pays),
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email', now(), now(), now()
    );
  end loop;
end $$;
