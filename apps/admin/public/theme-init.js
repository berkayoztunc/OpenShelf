// Applies the theme before first paint (external file: the admin CSP is script-src 'self', no inline scripts).
// Default is light; only an explicit choice (dark, or system) changes that.
try { var m = localStorage.getItem("os-theme"); if (m !== "system") document.documentElement.setAttribute("data-theme", m === "dark" ? "dark" : "light"); } catch (e) { document.documentElement.setAttribute("data-theme", "light"); }
