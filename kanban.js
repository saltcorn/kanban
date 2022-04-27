const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");

const {
  text,
  div,
  h5,
  h6,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  hr,
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
                name: "col_width",
                label: "Column width",
                type: "Integer",
                sublabel: "Leave blank to divide the screen width evenly",
              },
              {
                name: "col_width_units",
                label: "Column width units",
                type: "String",
                required: true,
                fieldview: "radio_group",
                attributes: {
                  inline: true,
                  options: ["px", "%", "vw", "em", "rem"],
                },
                default: "px",
              },
              {
                name: "reload_on_drag",
                label: "Reload page on drag",
                type: "Bool",
              },
              {
                name: "disable_column_reordering",
                label: "Disable column re-ordering",
                sublabel:
                  "Tick this to lock the ordering of the columns, but not the cards",
                type: "Bool",
              },
              {
                name: "column_padding",
                label: "Column padding",
                type: "Integer",
                sublabel: "0-5",
                attributes: {
                  max: 5,
                  min: 0,
                },
                default: 1,
              },
              {
                name: "col_bg_color",
                label: "Column background color",
                type: "Color",
                default: "#f0f0f0",
              },
              {
                name: "col_text_color",
                label: "Column text color",
                type: "Color",
                default: "#000000",
              },
              {
                name: "swimlane_field",
                label: "Swimlane field",
                type: "String",
                attributes: {
                  options: fields.map((f) => f.name).join(),
                },
              },
              {
                name: "swimlane_height",
                label: "Swimlane height px",
                type: "Integer",
                default: 300,
                showIf: { swimlane_field: fields.map((f) => f.name) },
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
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

const css = ({
  ncols,
  col_bg_color,
  col_text_color,
  col_width,
  col_width_units,
}) => `
  .kancol { 
    margin:2px;
    background-color: ${col_bg_color};
    box-shadow: 0px 16px 24px rgba(58, 79, 115, 0.08), 0px 2px 6px rgba(58, 79, 115, 0.07), 0px 0px 1px rgba(58, 79, 115, 0.04);
  }
  .kancol .card-header, .kancol .card-footer, .kancol .card-footer a {
    background-color: ${col_bg_color};
    color: ${col_text_color};
    padding: 2px 2px 4px;
    border: none;
  }
  .kancol .card-header h6 {
    margin-bottom: 0px;
  }
  .kancolwrap:nth-child(1) {
    padding-left: 0px;
  }
  .kancolwrap {
    padding-left: 5px;
    padding-right: 5px;
  }
  .kancolwrap.setwidth {
    ${col_width ? `width: ${col_width}${col_width_units} !important;` : ""}
    float: left;
  }
  .kanboard.setwidth {
    min-width: ${ncols * col_width}${col_width_units};
  }
  .kanboardwrap.setwidth {
    overflow-x: scroll;
    width: 100%;
  }
  .kancard { 
    padding:8px;
    margin:2px 2px 6px;
    display: block;
    box-shadow: 0px 10px 20px rgba(58, 79, 115, 0.04), 0px 2px 6px rgba(58, 79, 115, 0.08), 0px 0px 1px rgba(58, 79, 115, 0.04);
  }
  .kancard-empty-placeholder { 
    display:none
  }
  .kancard-empty-placeholder:only-child { 
    display:block
  }
  .kanswimcontents {
    overflow-y: scroll;
    overflow-x: clip;
  }
  .kanswimlane h5.swimlanehdr {
    margin-top: 5px;
    margin-bottom: 0px;    
  }
  .kanswimlane hr {
    margin: 0.2rem 0;    

  }
`;

const js = (
  table,
  column_field,
  viewname,
  reload_on_drag,
  disable_column_reordering
) => `

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
  ${
    disable_column_reordering
      ? ""
      : `
  var els=document.querySelectorAll('.kanboard')
  dragula(Array.from(els), {
    moves: function(el, container, handle) {
      return $(handle).closest('.kancard').length==0;
    }
  }).on('drop', function () {
    setTimeout(reportColumnValues, 0)
  })
  `
  }
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

const position_setter = (position_field, maxpos) =>
  position_field ? `&${position_field}=${Math.round(maxpos) + 2}` : "";
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
    column_padding,
    col_bg_color = "#f0f0f0",
    col_text_color = "#000000",
    col_width,
    col_width_units,
    disable_column_reordering,
    swimlane_field,
    swimlane_height,
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
  let originalColNames = {};
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
      originalColNames[r[column_field_field.attributes.summary_field]] = r.id;
    });
  }

  const ncols = Object.entries(cols).length;
  const sortCol = position_field
    ? (vs) => vs.sort((a, b) => a.row[position_field] - b.row[position_field])
    : (vs) => vs;
  const get_col_divs = ([hdrName, vs]) => {
    let maxpos = -10000;
    return div(
      { class: ["kancolwrap", col_width ? "setwidth" : "col"] },
      div(
        {
          class: [
            "kancol card",
            `p-${typeof column_padding === "undefined" ? 1 : column_padding}`,
          ],
        },
        div(
          { class: "card-header" },
          h6({ class: "card-title" }, text_attr(hdrName))
        ),
        div(
          { class: "kancontainer", "data-column-value": text_attr(hdrName) },
          div(
            {
              class: "kancard kancard-empty-placeholder",
            },
            i("(empty)")
          ),
          sortCol(vs || []).map(({ row, html }) => {
            if (position_field && row[position_field] > maxpos)
              maxpos = row[position_field];
            return (
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
            );
          })
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
                )}=${text_attr(
                  originalColNames[hdrName] || hdrName
                )}${position_setter(position_field, maxpos)}`,
              },
              i({ class: "fas fa-plus-circle mr-1" }),
              "Add new card"
            )
          )
      )
    );
  };
  let inner;
  if (swimlane_field) {
    const slField = fields.find((f) => f.name === swimlane_field);
    const dvs = await slField.distinct_values();
    inner = dvs.map(({ label, value }) => {
      const mycols = {};
      Object.keys(cols).map((k) => {
        mycols[k] = cols[k].filter(
          ({ row }) =>
            row[swimlane_field] === value || (!value && !row[swimlane_field])
        );
      });
      const col_divs = orderedEntries(mycols, column_order || []).map(
        get_col_divs
      );

      return div(
        {
          class: "kanswimlane",
        },
        h5({ class: "swimlanehdr" }, text(label)),
        hr(),
        div(
          {
            class: "kanswimcontents",
            style: swimlane_height
              ? { height: swimlane_height + "px" }
              : undefined,
          },
          div(
            {
              class: [
                "kanboard",
                col_width ? "setwidth" : `row row-cols-${col_divs.length}`,
              ],
            },
            col_divs
          )
        )
      );
    });
  } else {
    const col_divs = orderedEntries(cols, column_order || []).map(get_col_divs);
    inner = div(
      {
        class: [
          "kanboard",
          col_width ? "setwidth" : `row row-cols-${col_divs.length}`,
        ],
      },
      col_divs
    );
  }
  return div(
    { class: ["kanboardwrap", col_width ? "setwidth" : ""] },
    inner,
    //pre(JSON.stringify({table, name:table.name}))+
    style(
      css({ ncols, col_bg_color, col_text_color, col_width, col_width_units })
    ),
    role <= table.min_role_write &&
      script(
        domReady(
          js(
            table.name,
            column_field,
            viewname,
            reload_on_drag,
            disable_column_reordering
          )
        )
      )
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
      script: "/plugins/public/kanban/dragula.min.js",
    },
    {
      css: "/plugins/public/kanban/dragula.min.css",
    },
  ],
  sc_plugin_api_version: 1,
  plugin_name: "kanban",
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
