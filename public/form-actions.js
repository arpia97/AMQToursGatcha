// Named form controls can override properties such as form.id and form.action.
// Read the actual attribute when dispatching a submit event.
export const formIdentifier = (form) => form.getAttribute("id");
