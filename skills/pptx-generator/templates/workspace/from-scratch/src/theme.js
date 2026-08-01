"use strict";

function themeFromContract(designContract) {
  return {
    palette: designContract.palette_roles,
    typography: designContract.typography_roles,
    shapes: designContract.shape_language,
  };
}

module.exports = { themeFromContract };
