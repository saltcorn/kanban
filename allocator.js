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
  },
  state,
  extraArgs
) => {
  const tbl = await Table.findOne({ id: table_id });
  const fields = await tbl.getFields();
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
  const unallocated_sresps = await sview.runMany(
    { ...state, [row_field]: null, [col_field]: null },
    extraArgs
  );
  const row_vals = new Set([]);
  const col_vals = new Set([]);
  const by_row = {};
  for (const { html, row } of allocated_sresps) {
    const row_val = row[row_field];
    const col_val = row[col_field];
    col_vals.add(col_val);
    row_vals.add(row_val);
    if (!by_row[row_val]) by_row[row_val] = {};
    if (!by_row[row_val][col_val]) by_row[row_val][col_val] = [];
    by_row[row_val][col_val].push({ html, row });
  }
  const cols = [...col_vals];
  const widthPcnt = Math.round(100 / (cols.length + 1));

  const row_fld = fields.find((f) => f.name === row_field);
  const col_fld = fields.find((f) => f.name === col_field);
  const row_labels = {};
  for (const { label, value } of await row_fld.distinct_values()) {
    row_labels[value] = label;
  }
  const col_labels = {};
  for (const { label, value } of await col_fld.distinct_values()) {
    col_labels[value] = label;
  }

  const inner = table(
    { class: "kanalloc" },
    thead(
      tr(
        th(row_field),
        cols.map((c) => th(col_labels[c]))
      )
    ),
    tbody(
      Object.entries(by_row).map(([rv, colvs]) =>
        tr(
          td({ style: { width: `${widthPcnt}%` } }, row_labels[rv]),
          cols.map((c) =>
            td(
              { style: { width: `${widthPcnt}%` }, class: "droptarget" },
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
    table.kanalloc td.droptarget {
      border: 1px solid black;
      border-collapse: collapse;
    }`),

    script(domReady(""))
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
  { column_field, position_field, swimlane_field },
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
  const updRow = { [column_field]: colval };
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
    updRow[position_field] = newpos;
  }
  if (swimlane_field && !swimlane_field.includes(".")) {
    updRow[swimlane_field] = body[swimlane_field] || null;
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
