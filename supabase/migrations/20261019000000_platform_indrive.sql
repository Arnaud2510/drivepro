-- inDrive, offered in several West and Central African cities.
insert into public.transport_platforms (id, name, kind) values ('indrive', 'inDrive', 'ride_hailing')
  on conflict (id) do nothing;
insert into public.platform_countries (platform_id, country_code) values
  ('indrive', 'CI'), ('indrive', 'SN'), ('indrive', 'CM')
  on conflict do nothing;
