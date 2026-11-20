ALTER TABLE "search_documents" ADD COLUMN rooms JSONB CHECK (jsonb_typeof(rooms) = 'array');
