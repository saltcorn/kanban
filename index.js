module.exports = {
  headers: [
    {
      script: `/plugins/public/kanban@${
        require("./package.json").version
      }/dragula.min.js`,
    },
    {
      css: `/plugins/public/kanban@${
        require("./package.json").version
      }/dragula.min.css`,
    },
  ],
  sc_plugin_api_version: 1,
  plugin_name: "kanban",
  viewtemplates: [require("./kanban"), require("./allocator")],
  ready_for_mobile: true,
};
