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
  table,
  thead,
  tbody,
  th,
  tr,
  td,
} = require("@saltcorn/markup/tags");
const {
  stateFieldsToWhere,
  readState,
} = require("@saltcorn/data//plugin-helper");
const moment = require("moment");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        disablePreview: true,
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();

          const show_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              (viewtemplate?.runMany || viewtemplate?.renderRows) &&
              viewrow.name !== context.viewname
          );
          const show_view_opts = show_views.map((v) => v.name);

          const expand_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname
          );
          const expand_view_opts = expand_views.map((v) => v.name);
          const fk_fields = fields.filter((f) => f.is_fkey && f.reftable_name);
          const fk_date_fields = fields.filter(
            (f) => (f.is_fkey && f.reftable_name) || f.type?.name === "Date"
          );
          const date_fields = fields.filter((f) => f.type?.name === "Date");

          return new Form({
            fields: [
              { input_type: "section_header", label: "Item view" },
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
                name: "reload_on_drag",
                label: "Reload page on drag",
                type: "Bool",
              },
              { input_type: "section_header", label: "Rows" },
              {
                name: "row_field",
                label: "Row field",
                type: "String",
                required: true,
                attributes: {
                  options: fk_fields.map((f) => f.name),
                },
              },
              {
                name: "row_where",
                label: "Where",
                sublabel: "include the rows that match this formula",
                type: "String",
              },
              {
                type: "String",
                name: "unallocated_row_label",
                label: "Unallocated label",
              },
              {
                name: "row_hdr_width",
                label: "Label cell width px",
                type: "Integer",
              },

              { input_type: "section_header", label: "Columns" },
              {
                name: "col_field",
                label: "Column field",
                type: "String",
                required: true,
                attributes: {
                  options: fk_date_fields.map((f) => f.name),
                },
              },
              {
                name: "col_field_format",
                label: "Column format",
                type: "String",
                sublabel: "moment.js format specifier",
                showIf: {
                  col_field: date_fields.map((f) => f.name),
                },
              },
              {
                name: "col_no_weekends",
                label: "No weekend columns",
                type: "Bool",
                sublabel: "Exclude weekend days from columns",
                showIf: {
                  col_field: date_fields.map((f) => f.name),
                },
              },
              {
                type: "String",
                name: "unallocated_col_label",
                label: "Unallocated label",
              },
              {
                name: "col_width",
                label: "Column width px",
                type: "Integer",
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

const isWeekend = (date) => ((d) => d === 0 || d === 6)(date.getDay());

const run = async (
  table_id,
  viewname,
  {
    show_view,
    expand_view,
    reload_on_drag,
    row_field,
    col_field,
    row_where,
    col_field_format,
    col_no_weekends,
    unallocated_col_label,
    unallocated_row_label,
    col_width,
    row_hdr_width,
  },
  state,
  extraArgs
) => {
  const tbl = await Table.findOne({ id: table_id });
  const fields = await tbl.getFields();
  const row_fld = fields.find((f) => f.name === row_field);
  const col_fld = fields.find((f) => f.name === col_field);
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

  const allocated_sresps = await sview.runMany(state, extraArgs);

  //if state is col or row fld, also get unallocated
  if (state[row_field])
    allocated_sresps.push(
      ...(await sview.runMany({ ...state, [row_field]: null }, extraArgs))
    );
  if (
    state[col_field] ||
    (col_fld.type?.name === "Date" && state[`_fromdate_${col_field}`])
  )
    allocated_sresps.push(
      ...(await sview.runMany({ ...state, [col_field]: null }, extraArgs))
    );
  let xformCol = (x) => x;
  const col_vals = new Set([]);

  const col_labels = {};

  if (col_fld.type?.name === "Date") {
    allocated_sresps.forEach(({ row }) => {
      if (row[col_field]) {
        row[col_field] = new Date(row[col_field]).toISOString().split("T")[0];
      }
    });
    if (col_field_format)
      xformCol = (day) => moment(day).format(col_field_format);
    if (state["_fromdate_" + col_field] && state["_todate_" + col_field]) {
      const start = new Date(state["_fromdate_" + col_field]);
      const end = new Date(state["_todate_" + col_field]);
      let day = start;
      while (day <= end) {
        if (!col_no_weekends || !isWeekend(day)) {
          const dayStr = day.toISOString().split("T")[0];
          //const xdayStr = xformCol(dayStr);
          col_vals.add(dayStr);
          //rawColValues[xdayStr] = dayStr;
          col_labels[dayStr] = col_field_format
            ? moment(day).format(col_field_format)
            : dayStr;
        }
        day = new Date(day);
        day.setDate(day.getDate() + 1);
      }
    }
  } else
    for (const { label, value } of await col_fld.distinct_values()) {
      col_labels[value] = label;
    }

  const row_vals = new Set([]);

  const by_row = {};
  const row_labels = {};
  for (const { label, value } of await row_fld.distinct_values()) {
    row_vals.add(value || "");
    row_labels[value || ""] = !value ? unallocated_row_label || label : label;
    if (!by_row[value || ""]) by_row[value || ""] = {};
  }

  for (const { html, row } of allocated_sresps) {
    const row_val = row[row_field] || "";
    const col_val = row[col_field];
    col_vals.add(col_val);
    row_vals.add(row_val);
    if (!col_labels[col_val])
      col_labels[col_val] = !col_val
        ? unallocated_col_label || xformCol(col_val)
        : xformCol(col_val);
    if (!by_row[row_val]) by_row[row_val] = {};
    if (!by_row[row_val][col_val]) by_row[row_val][col_val] = [];
    by_row[row_val][col_val].push({ html, row });
  }
  const cols = [...col_vals];
  const defWidth = `${Math.round(100 / (cols.length + 1))}%`;
  const tableWidth = col_width
    ? cols.length * col_width + row_hdr_width
    : undefined;

  const inner = table(
    { class: "kanalloc" },
    thead(
      tr(
        th(
          {
            style: {
              width: row_hdr_width ? `${row_hdr_width}px` : defWidth,
            },
          },
          row_field
        ),
        cols.map((c) =>
          th(
            {
              style: {
                width: col_width ? `${col_width}px` : defWidth,
              },
            },
            col_labels[c]
          )
        )
      )
    ),
    tbody(
      Object.entries(by_row).map(([rv, colvs]) =>
        tr(
          td(
            {
              style: {
                width: row_hdr_width ? `${row_hdr_width}px` : defWidth,
              },
            },
            row_labels[rv]
          ),
          cols.map((c) =>
            td(
              {
                style: {
                  width: col_width ? `${col_width}px` : defWidth,
                },
                class: "alloctarget",
                "data-row-val": rv,
                "data-col-val": c,
              },
              (colvs[c] || []).map(
                ({ row, html }) =>
                  div(
                    {
                      class: "kancard card",
                      "data-id": text(row.id),
                      ...(expand_view && {
                        onClick: `ajax_modal('/view/${expand_view}?id=${row.id}')`,
                      }),
                    },
                    html
                  ) + "\n"
              )
            )
          )
        )
      )
    )
  );

  return div(
    { class: [] },
    inner,
    //pre(JSON.stringify({table, name:table.name}))+
    style(`
    table.kanalloc { 
      table-layout: fixed;
      ${tableWidth ? `width: ${tableWidth}px;` : ""} 
    }
    table.kanalloc td, table.kanalloc th {
      border: 1px solid black;
      border-collapse: collapse;
      overflow: hidden;
      text-overflow: ellipsis;
    }`),

    script(
      domReady(`
      var onDone=function(){
        ${reload_on_drag ? "location.reload();" : ""}
      }
    var els=document.querySelectorAll('.alloctarget')
  dragula(Array.from(els), {
    moves: function(el, container, handle) {
      return !el.className.includes('empty-placeholder')
    }
  }).on('drop', function (el,target, src,before) {
    var dataObj={ id: $(el).attr('data-id') }
    dataObj.${col_field}=$(target).attr('data-col-val');   
    dataObj.${row_field}=$(target).attr('data-row-val');      
    view_post('${viewname}', 'set_card_value', dataObj, onDone);
  })
    `)
    )
  );
};

const connectedObjects = async ({ show_view, expand_view }) => {
  const linkedViews = [];
  const embeddedViews = [];

  const showView = show_view ? View.findOne({ name: show_view }) : undefined;
  if (showView) embeddedViews.push(showView);
  const expandView = expand_view
    ? View.findOne({ name: expand_view })
    : undefined;
  if (expandView) embeddedViews.push(expandView);
  return {
    embeddedViews,
    linkedViews,
  };
};

//card has been dragged btw columns
const set_card_value = async (
  table_id,
  viewname,
  {
    show_view,
    expand_view,
    reload_on_drag,
    row_field,
    col_field,
    row_where,
    col_field_format,
    col_no_weekends,
  },
  body,
  { req }
) => {
  const table = await Table.findOne({ id: table_id });
  const role = req.isAuthenticated() ? req.user.role_id : 10;
  if (role > table.min_role_write) {
    return { json: { error: "not authorized" } };
  }
  const cv = body[col_field]; //
  const rv = body[row_field];
  const fields = await table.getFields();
  const col_fld = fields.find((f) => f.name === col_field);
  const updRow = {
    [col_field]: cv === "null" ? null : cv,
    [row_field]: rv === "null" || rv === "" ? null : rv,
  };
  if (col_fld.type?.name === "Date" && updRow[col_field]) {
    updRow[col_field] += "T00:00:00.000Z";
  }

  await table.updateRow(updRow, parseInt(body.id));
  return { json: { success: "ok" } };
};

module.exports = {
  name: "KanbanAllocator",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
  connectedObjects,
  routes: { set_card_value },
};

/*to do

1. time cols
*/
