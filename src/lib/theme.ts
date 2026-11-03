// The theme choice lives in localStorage ("theme": "light" | "dark"); light
// (cream) is the default. THEME_SCRIPT runs inline in <head> of the root
// layout and applies it before the first paint, so there is no flash on load.
export const THEME_KEY = "theme";
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
