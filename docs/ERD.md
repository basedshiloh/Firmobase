# Firmobase — Entity Relationship Diagram

Core company registry + financials + grants. All tables keyed by internal UUID.

```mermaid
erDiagram
    companies ||--o{ company_addresses : has
    companies ||--o{ company_roles     : has
    companies ||--o{ company_pkd       : classified_by
    companies ||--o{ company_grants    : received
    companies ||--o| persons           : "may map to (legal person)"
    persons   ||--o{ company_roles     : holds
    pkd_codes ||--o{ company_pkd       : referenced_by
    grants    ||--o{ company_grants    : awarded_to

    companies {
        uuid id PK
        text krs UK
        text nip
        text regon
        text name
        text legal_form
        text status
        date registration_date
        numeric share_capital
        text website
        text email
        text phone
        jsonb raw
        timestamptz last_ingested_at
    }

    company_addresses {
        uuid id PK
        uuid company_id FK
        text address_type
        text street
        text city
        text postal_code
        text voivodeship
        date valid_from
        date valid_to
    }

    persons {
        uuid id PK
        person_type person_type
        text full_name
        text first_name
        text last_name
        uuid linked_company_id FK
        text normalized_name
    }

    company_roles {
        uuid id PK
        uuid company_id FK
        uuid person_id FK
        role_category role_category
        text position
        numeric shareholding_pct
        date appointed_at
        date ended_at
        boolean is_current
    }

    pkd_codes {
        text code PK
        text description
        text section
    }

    company_pkd {
        uuid id PK
        uuid company_id FK
        text pkd_code FK
        boolean is_primary
    }

    grants {
        uuid id PK
        text program
        smallint program_year
        text title
        text description
        text beneficiary_name
        numeric amount_pln
        numeric amount_eu
        date start_date
        date end_date
        text status
        text voivodeship
        text source_id UK
    }

    company_grants {
        uuid id PK
        uuid company_id FK
        uuid grant_id FK
        text match_method
        real match_score
    }

    ingestion_runs {
        uuid id PK
        text source
        text target_krs
        text status
        integer records_processed
        timestamptz started_at
        timestamptz finished_at
    }
```

## Design notes

- **`companies.krs`** is the natural key from eKRS (10 digits, leading zeros preserved as text). Unique but nullable so a company discovered by NIP/name before its KRS is resolved can still be inserted.
- **`persons`** holds *both* natural people and legal entities that hold roles. When a role-holder is itself a tracked company, `linked_company_id` connects them — this is the seed of the Phase 5 relationship graph (company → person → company).
- **`company_roles`** is temporal (`appointed_at` / `ended_at` / `is_current`) so we keep full board/shareholder history, not just the current snapshot.
- **`company_addresses`** is temporal too (`valid_from` / `valid_to`) for address-change timelines.
- **`raw` jsonb** columns store the original source payload so we can reprocess without re-fetching when the parser improves.
- **Search:** `pg_trgm` GIN indexes on `companies.name` and `persons.normalized_name` give typo tolerance and autocomplete now; Phase 2 layers `tsvector` full-text on top.
