const Field = require("saltcorn-data/models/field");
const Table = require("saltcorn-data/models/table");
const Form = require("saltcorn-data/models/form");
const View = require("saltcorn-data/models/view");
const Workflow = require("saltcorn-data/models/workflow");

const { textarea, text } = require("saltcorn-markup/tags");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async context => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();

          const show_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewtemplate.runMany &&
              viewrow.name !== context.viewname &&
              state_fields.some(sf => sf.name === "id")
          );
          const show_view_opts = show_views.map(v => v.name);

          return new Form({
            fields: [
              {
                name: "show_view",
                label: "Card View",
                type: "String",
                required: true,
                attributes: {
                  options: show_view_opts.join()
                }
              },
              {
                name: "column_field",
                label: "Columns by",
                type: "String",
                required: true,
                attributes: {
                  options: fields.map(f => f.name).join()
                }
              }
            ]
          });
        }
      }
    ]
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
  return table_fields.map(f => {
    const sf = new Field(f);
    sf.required = false;
    return sf;
  });
};

const nub = xs => [...new Set(xs)];

const run = async (
  table_id,
  viewname,
  { show_view, column_field },
  state,
  extraArgs
) => {
  const sview = await View.findOne({ name: show_view });
  const sresp = await sview.runMany(state, extraArgs);
  var cols = new Set(sresp.map(({ row }) => row[column_field]));
  return sresp.map(r => div(r.html) + hr());
};

module.exports = {
  viewtemplates: [
    {
      name: "Kanban",
      display_state_form: false,
      get_state_fields,
      configuration_workflow,
      run
    }
  ]
};
