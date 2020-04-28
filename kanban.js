const Field = require("saltcorn-data/models/field");
const Table = require("saltcorn-data/models/table");
const Form = require("saltcorn-data/models/form");
const View = require("saltcorn-data/models/view");
const Workflow = require("saltcorn-data/models/workflow");

const {
  text,
  div,
  h3,
  style,
  a,
  script,
  pre,
  domReady
} = require("saltcorn-markup/tags");

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
              viewtemplate.runMany && viewrow.name !== context.viewname
          );
          const show_view_opts = show_views.map(v => v.name);

          const expand_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname
          );
          const expand_view_opts = expand_views.map(v => v.name);

          const create_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewrow }) =>
              viewrow.name !== context.viewname &&
              state_fields.every(sf => !sf.required)
          );
          const create_view_opts = create_views.map(v => v.name);

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
                name: "expand_view",
                label: "Expand View",
                type: "String",
                required: false,
                attributes: {
                  options: expand_view_opts.join()
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
              },
              {
                name: "view_to_create",
                label: "Use view to create",
                sublabel: "Leave blank to have no link to create a new item",
                type: "String",
                attributes: {
                  options: create_view_opts.join()
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

const css = `
  .kancol { 
    border: 1px solid black;
    padding:2px ; margin:2px;
  }
  .kancard { border: 1px solid blue;  
    padding:2px;
    margin:2px;
  }
`;

const js = (table, column_field) => `
  var els=document.querySelectorAll('.kancontainer')
  dragula(Array.from(els)).on('drop', function (el,target) {
    var dataObj={ id: $(el).attr('data-id')}
    dataObj.${column_field}=$(target).attr('data-column-value')
    $.ajax('/edit/${table}', {
      contentType: "application/x-www-form-urlencoded",
      type: 'POST',
      data: dataObj
    });   
  })
  var getColumnValues=function() {
    var vs = []
    $('.kancontainer').each(function(){
      vs.push($(this).attr('data-column-value'))
    })
    console.log(vs)
    return vs
  }
  getColumnValues()
  
  var els=document.querySelectorAll('.kanboard')
  dragula(Array.from(els)).on('drop', function () {
    setTimeout(getColumnValues, 0)
  })
`;

const run = async (
  table_id,
  viewname,
  { show_view, column_field, view_to_create, expand_view },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const sview = await View.findOne({ name: show_view });
  const sresps = await sview.runMany(state, extraArgs);
  var cols = groupBy(sresps, ({ row }) => row[column_field]);
  const col_divs = Object.entries(cols).map(([k, vs]) =>
    div(
      { class: "kancol" },
      h3(text(k)),
      div(
        { class: "kancontainer", "data-column-value": text(k) },
        vs.map(({ row, html }) =>
          div(
            {
              class: "kancard",
              "data-id": text(row.id),
              ...(expand_view && {
                onClick: `href_to('/view/${expand_view}?id=${row.id}')`
              })
            },
            html
          )
        )
      ),
      view_to_create &&
        a(
          { href: `/view/${view_to_create}?${column_field}=${k}` },
          "Add new card"
        )
    )
  );
  return (
    div({ class: "d-flex kanboard" }, col_divs) +
    //pre(JSON.stringify({table, name:table.name}))+
    style(css) +
    script(domReady(js(table.name, column_field)))
  );
};

module.exports = {
  headers: [
    {
      script:
        "https://cdnjs.cloudflare.com/ajax/libs/dragula/3.7.2/dragula.min.js"
    },
    {
      css:
        "https://cdnjs.cloudflare.com/ajax/libs/dragula/3.7.2/dragula.min.css"
    }
  ],
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
