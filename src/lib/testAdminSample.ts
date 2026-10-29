/** Ids created for `/test/admin`. Saves with these ids stay in the browser. */
export function isTestAdminSampleId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("demo-");
}
