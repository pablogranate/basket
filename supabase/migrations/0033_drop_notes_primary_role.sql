-- "Rol principal" is gone from the app: person_functions is the only role
-- source. Strip the legacy "Rol principal: X" line from people.notes so the
-- value stops leaking into the free-notes field now that nothing parses it.
-- Collapses the blank line the prefix block used to leave behind, and nulls out
-- notes that held nothing else.
update people
set notes = nullif(
  btrim(
    regexp_replace(
      regexp_replace(notes, '(^|\n)[ \t]*Rol principal:[^\n]*(\n|$)', E'\\1', 'g'),
      '\n{3,}',
      E'\n\n',
      'g'
    ),
    E' \t\n\r'
  ),
  ''
)
where notes like '%Rol principal:%';
