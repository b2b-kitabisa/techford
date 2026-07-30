/**
 * Module.GdvMatching.Exposed
 */
function gdvMatching_getMatching() {
  return GdvMatchingController.getMatching();
}

function gdvMatching_getStatusForLinks(links) {
  return GdvMatchingController.getStatusForLinks(links);
}
