# Backend database migrations

This project uses plain, reviewed PostgreSQL scripts; there is no migration runner yet.

- Name each forward migration with a zero-padded sequence and a short description, such as `001_add_food_search_columns.sql`.
- Keep a matching rollback script beside it, named `<version>_<description>.rollback.sql`.
- Apply migrations manually, in numeric order, and record the applied version in the deployment/change log. Do not rerun an applied migration.
- Review the target database and make a backup according to the project's normal database procedure before applying a migration. A rollback is a separate, deliberate operation because it can discard data stored in the added columns.
- Keep schema changes additive where practical. Do not put application data seeds or application code in migration scripts.

Migration `001` requires the PostgreSQL `vector` extension to be installed already. It adds nullable semantic-search fields to `public.foods`; it does not create an index or populate embeddings.
