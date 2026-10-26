// Applies the stored theme before first paint (external file: the admin CSP is script-src 'self', no inline scripts).
try { var m = localStorage.getItem("os-theme"); if (m === "light" || m === "dark") document.documentElement.setAttribute("data-theme", m); } catch (e) {}
