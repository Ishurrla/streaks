/** One JSON line per entry, which Vercel's log viewer shows with its fields. */
function write(severity: "INFO" | "ERROR", message: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ severity, message, ...fields });
  if (severity === "ERROR") console.error(line);
  else console.log(line);
}

export const log = {
  info: (message: string, fields: Record<string, unknown> = {}) => write("INFO", message, fields),
  error: (message: string, fields: Record<string, unknown> = {}) => write("ERROR", message, fields),
};
