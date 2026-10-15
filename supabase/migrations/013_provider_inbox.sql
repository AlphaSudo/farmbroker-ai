-- 013: provider inbox resume columns (2.3). Verify-before-dedupe; seen-but-unprocessed resumes.
alter table paypal_events add column if not exists verified_by text;
alter table paypal_events add column if not exists resume_count int not null default 0;
