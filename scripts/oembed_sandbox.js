// This script gets loaded into every sandboxed iframe.
document.__defineGetter__("cookies", () => "");
