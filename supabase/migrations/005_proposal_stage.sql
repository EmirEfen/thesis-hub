-- Adds "proposal" as a progress stage.
alter table public.section_progress drop constraint section_progress_section_check;
alter table public.section_progress add constraint section_progress_section_check
  check (section in ('proposal','introduction','literature_review','methods','data_collection','results','general_discussion'));
