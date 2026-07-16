/**
 * Module.MarginGuide.Exposed
 */
function marginguide_getAll() {
  return MarginGuideController.getAll();
}

function marginguide_add(component, subCategory, percentage, createdBy) {
  return MarginGuideController.add(component, subCategory, percentage, createdBy);
}

function marginguide_remove(marginGuideId) {
  return MarginGuideController.remove(marginGuideId);
}
