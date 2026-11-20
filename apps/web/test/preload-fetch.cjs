// Initialize Node's multipart parser before jsdom replaces the global File constructor.
void globalThis.FormData;
