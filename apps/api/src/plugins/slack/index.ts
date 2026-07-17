// Installed integration: the implementation lives in @headless-lms/plugin-slack.
// This shim keeps the plugin-folder convention (directory name = integration id)
// that composition's loadIntegrations scans at startup.
export { default } from "@headless-lms/plugin-slack";
