const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");

const {
  text,
  div,
  h3,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  text_attr,
} = require("@saltcorn/markup/tags");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();

          const show_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              (viewtemplate.runMany || viewtemplate.renderRows) &&
              viewrow.name !== context.viewname
          );
          const show_view_opts = show_views.map((v) => v.name);

          const expand_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname
          );
          const expand_view_opts = expand_views.map((v) => v.name);

          const create_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewrow }) =>
              viewrow.name !== context.viewname &&
              state_fields.every((sf) => !sf.required)
          );
          const create_view_opts = create_views.map((v) => v.name);

          return new Form({
            fields: [
              {
                name: "show_view",
                label: "Card View",
                type: "String",
                required: true,
                attributes: {
                  options: show_view_opts.join(),
                },
              },
              {
                name: "expand_view",
                label: "Expand View",
                type: "String",
                required: false,
                attributes: {
                  options: expand_view_opts.join(),
                },
              },
              {
                name: "column_field",
                label: "Columns by",
                type: "String",
                required: true,
                attributes: {
                  options: fields.map((f) => f.name).join(),
                },
              },
              {
                name: "position_field",
                label: "Positions field",
                type: "String",
                sublabel:
                  "The table need a fields of type 'Float' to track positions within each column. If you do not select or do not have a position field, the position within each column cannot be stored.",
                required: false,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Float")
                    .map((f) => f.name)
                    .join(),
                },
              },
              {
                name: "view_to_create",
                label: "Use view to create",
                sublabel: "Leave blank to have no link to create a new item",
                type: "String",
                attributes: {
                  options: create_view_opts.join(),
                },
              },
              {
                name: "reload_on_drag",
                label: "Reload page on drag",
                type: "Bool",
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
  return table_fields.map((f) => {
    const sf = new Field(f);
    sf.required = false;
    return sf;
  });
};

//https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-an-array-of-objects
function groupBy(list, keyGetter) {
  var map = {};
  list.forEach((item) => {
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

const orderedEntries = (obj, keyList) => {
  var entries = [];
  keyList.forEach((k) => {
    if (typeof obj[k] !== "undefined") entries.push([k, obj[k]]);
  });
  Object.entries(obj).forEach(([k, v]) => {
    if (!keyList.includes(k)) entries.push([k, v]);
  });
  return entries;
};

const css = (ncols) => `
  .kancol { 
    border: 1px solid black;
    padding:2px ; margin:2px;
    background-color: #f0f0f0;
    
  }
  .kancolwrap {
    padding-left: 3px;
    padding-right: 3px;
  }
  .kancard { 
    border: 1px solid #aaaaaa;  
    padding:2px;
    margin:2px;
  }
  .kancard-empty-placeholder { 
    display:none
  }
  .kancard-empty-placeholder:only-child { 
    display:block
  }
`;

const js = (table, column_field, viewname, reload_on_drag) => `

  var getColumnValues=function() {
    var vs = []
    $('.kancontainer').each(function(){
      vs.push($(this).attr('data-column-value'))
    })
    return vs
  }
  var onDone=function(){
    ${reload_on_drag ? "location.reload();" : ""}
  }
  var reportColumnValues=function(){
    view_post('${viewname}', 'set_col_order', getColumnValues());
  }
  var els=document.querySelectorAll('.kanboard')
  dragula(Array.from(els), {
    moves: function(el, container, handle) {
      return $(handle).closest('.kancard').length==0;
    }
  }).on('drop', function () {
    setTimeout(reportColumnValues, 0)
  })
  var els=document.querySelectorAll('.kancontainer')
  dragula(Array.from(els), {
    moves: function(el, container, handle) {
      return !el.className.includes('empty-placeholder')
    }
  }).on('drop', function (el,target, src,before) {
    var dataObj={ id: $(el).attr('data-id'),
                  before_id: before ? $(before).attr('data-id') : null }
    dataObj.${column_field}=$(target).attr('data-column-value')
    view_post('${viewname}', 'set_card_value', dataObj, onDone);
  })
`;

const assign_random_positions = async (rows, position_field, table_id) => {
  var table;
  for (const { row } of rows) {
    if (
      typeof row[position_field] === "undefined" ||
      row[position_field] === null
    ) {
      row[position_field] = Math.random();
      if (!table) table = await Table.findOne({ id: table_id });
      await table.updateRow({ [position_field]: row[position_field] }, row.id);
    }
  }
};
const readState = (state, fields) => {
  fields.forEach((f) => {
    const current = state[f.name];
    if (typeof current !== "undefined") {
      if (f.type.read) state[f.name] = f.type.read(current);
      else if (f.type === "Key")
        state[f.name] = current === "null" ? null : +current;
    }
  });
  return state;
};
const run = async (
  table_id,
  viewname,
  {
    show_view,
    column_field,
    view_to_create,
    expand_view,
    column_order,
    position_field,
    reload_on_drag,
  },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  readState(state, fields);
  const role = extraArgs.req.isAuthenticated()
    ? extraArgs.req.user.role_id
    : 10;
  const sview = await View.findOne({ name: show_view });
  if (!sview)
    return div(
      { class: "alert alert-danger" },
      "Kanban board incorrectly configured. Cannot find view: ",
      show_view
    );

  const sresps = await sview.runMany(state, extraArgs);
  if (position_field)
    await assign_random_positions(sresps, position_field, table_id);
  var cols = groupBy(sresps, ({ row }) => row[column_field]);

  const column_field_field = fields.find((f) => f.name === column_field);
  if (
    column_field_field &&
    column_field_field.attributes &&
    column_field_field.attributes.options
  ) {
    var colOpts = column_field_field.attributes.options
      .split(",")
      .map((s) => s.trim());
    colOpts.forEach((col) => {
      if (!cols[col]) cols[col] = [];
    });
  } else if (column_field_field && column_field_field.type === "Key") {
    const reftable = await Table.findOne({
      name: column_field_field.reftable_name,
    });
    const refRows = await reftable.getRows();
    refRows.forEach((r) => {
      if (cols[r.id]) {
        cols[r[column_field_field.attributes.summary_field]] = cols[r.id];
        delete cols[r.id];
      } else cols[r[column_field_field.attributes.summary_field]] = [];
    });
  }

  const ncols = Object.entries(cols).length;
  const sortCol = position_field
    ? (vs) => vs.sort((a, b) => a.row[position_field] - b.row[position_field])
    : (vs) => vs;
  const col_divs = orderedEntries(cols, column_order || []).map(([k, vs]) =>
    div(
      { class: "col kancolwrap" },
      div(
        { class: "kancol card" },
        div(
          { class: "card-header" },
          h3({ class: "card-title" }, text_attr(k))
        ),
        div(
          { class: "kancontainer", "data-column-value": text_attr(k) },
          div(
            {
              class: "kancard kancard-empty-placeholder",
            },
            i("(empty)")
          ),
          sortCol(vs || []).map(
            ({ row, html }) =>
              div(
                {
                  class: "kancard card",
                  "data-id": text(row.id),
                  ...(expand_view && {
                    onClick: `href_to('/view/${expand_view}?id=${row.id}')`,
                  }),
                },
                html
              ) + "\n"
          )
        ),
        view_to_create &&
          role <= table.min_role_write &&
          div(
            { class: "card-footer" },
            a(
              {
                class: "card-link",
                href: `/view/${text(view_to_create)}?${text_attr(
                  column_field
                )}=${text_attr(k)}`,
              },
              "Add new card"
            )
          )
      )
    )
  );
  return (
    div({ class: "row kanboard" }, col_divs) +
    //pre(JSON.stringify({table, name:table.name}))+
    style(css(ncols)) +
    script(domReady(js(table.name, column_field, viewname, reload_on_drag)))
  );
};

//card has been dragged btw columns
const set_card_value = async (
  table_id,
  viewname,
  { column_field, position_field },
  body,
  { req }
) => {
  const table = await Table.findOne({ id: table_id });
  const role = req.isAuthenticated() ? req.user.role_id : 10;
  if (role > table.min_role_write) {
    return { json: { error: "not authorized" } };
  }
  let colval = body[column_field];
  const fields = await table.getFields();
  const column_field_field = fields.find((f) => f.name === column_field);
  if (column_field_field && column_field_field.type === "Key") {
    const reftable = await Table.findOne({
      name: column_field_field.reftable_name,
    });
    const refrow = await reftable.getRow({
      [column_field_field.attributes.summary_field]: body[column_field],
    });
    colval = refrow.id;
  }
  if (position_field) {
    var newpos;
    const exrows = await table.getRows(
      { [column_field]: colval },
      { orderBy: position_field }
    );
    const before_id = parseInt(body.before_id);
    if (before_id) {
      const before_ix = exrows.findIndex((row) => row.id === before_id);
      if (before_ix === 0) newpos = exrows[0][position_field] - 1;
      else
        newpos =
          (exrows[before_ix - 1][position_field] +
            exrows[before_ix][position_field]) /
          2;
    } else {
      if (exrows.length > 0)
        newpos = exrows[exrows.length - 1][position_field] + 1;
      else newpos = Math.random();
    }

    await table.updateRow(
      { [column_field]: colval, [position_field]: newpos },
      parseInt(body.id)
    );
  } else {
    await table.updateRow({ [column_field]: colval }, parseInt(body.id));
  }

  return { json: { success: "ok" } };
};

//whole column has been moved
const set_col_order = async (table_id, viewname, config, body, { req }) => {
  const table = await Table.findOne({ id: table_id });

  const role = req.isAuthenticated() ? req.user.role_id : 10;
  if (role > table.min_role_write) {
    return { json: { error: "not authorized" } };
  }
  const view = await View.findOne({ name: viewname });
  const newConfig = {
    configuration: { ...view.configuration, column_order: body },
  };
  await View.update(newConfig, view.id);
  return { json: { success: "ok", newconfig: newConfig } };
};
module.exports = {
  headers: [
    {
      script:
        "https://cdnjs.cloudflare.com/ajax/libs/dragula/3.7.2/dragula.min.js",
      integrity: "sha256-ug4bHfqHFAj2B5MESRxbLd3R3wdVMQzug2KHZqFEmFI=",
    },
    {
      css:
        "https://cdnjs.cloudflare.com/ajax/libs/dragula/3.7.2/dragula.min.css",
    },
  ],
  sc_plugin_api_version: 1,
  viewtemplates: [
    {
      name: "Kanban",
      display_state_form: false,
      get_state_fields,
      configuration_workflow,
      run,
      routes: { set_col_order, set_card_value },
    },
  ],
};
