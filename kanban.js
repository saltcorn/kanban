const Field = require("saltcorn-data/models/field");
const Table = require("saltcorn-data/models/table");
const Form = require("saltcorn-data/models/form");
const View = require("saltcorn-data/models/view");
const Workflow = require("saltcorn-data/models/workflow");

const { text, div, h3, style } = require("saltcorn-markup/tags");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async context => {
          console.log({ context });

          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();

          const show_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewtemplate.runMany && viewrow.name !== context.viewname
          );
          const show_view_opts = show_views.map(v => v.name);
          console.log({ show_views });
          return new Form({
            blurb: JSON.stringify(show_views),
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

//https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-an-array-of-objects
function groupBy(list, keyGetter) {
  var map = {};
  list.forEach(item => {
    const key = keyGetter(item);
    const collection = map[key];
    if (!collection) {
      map[key] = [item];
    } else {
      collection.push(item);
    }
  });
  return map;
}

const run = async (
  table_id,
  viewname,
  { show_view, column_field },
  state,
  extraArgs
) => {
  const sview = await View.findOne({ name: show_view });
  const sresps = await sview.runMany(state, extraArgs);
  var cols = groupBy(sresps, ({ row }) => row[column_field]);
  const col_divs = Object.entries(cols).map(([k, vs]) =>
    div(
      { class: "kancol" },
      h3(text(k)),
      vs.map(({ row, html }) => div({ class: "kancard" }, html))
    )
  );
  return (
    div({ class: "d-flex" }, col_divs) +
    style(`
         .kancol { border: 1px solid black;
                   padding:2px ; margin:2px;
                  }
         .kancard { border: 1px solid blue;  
                    padding:2px;
                    margin:2px;
                  }
         `)
  );
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
