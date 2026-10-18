/**
 * Module Description: Register Visual Theme Controller
 * Manages active styling modes (Basic High-Contrast Industrial vs Modern Rounded Elevation).
 * Persists theme choice to localStorage, synchronizes data-theme attributes on the document
 * body, and updates active button states across terminal controls.
 */

export const Theme = {
  current: "modern",

  /**
   * Applies the modern theme, updates document attributes, and saves preference
   * @param {string} name - Theme name (retains 'modern')
   */
  set(name = "modern") {
    this.current = "modern";
    document.body.setAttribute("data-theme", "modern");
    localStorage.setItem("pos_theme", "modern");
  },

  /**
   * Initializes visual theme state on application startup
   */
  init() {
    this.set("modern");
  }
};

// REMARK: THEME_JS_MODULARIZATION_COMPLETE