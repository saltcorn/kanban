const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Trigger = require("@saltcorn/data/models/trigger");
const { jsexprToWhere } = require("@saltcorn/data/models/expression");

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
  runCollabEvents,
} = require("@saltcorn/data/plugin-helper");
const moment = require("moment");

const { features } = require("@saltcorn/data/db/state");
const db = require("@saltcorn/data/db");

const public_user_role = features?.public_user_role || 10;

const configuration_workflow = (req) =>
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
          const triggers = Trigger.find();
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
              {
                name: "item_where",
                label: "Where",
                sublabel: "include the items that match this formula",
                type: "String",
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
              { input_type: "section_header", label: "Layout" },
              {
                name: "grid_color",
                label: "Grid color",
                type: "Color",
              },
              {
                name: "label_color",
                label: "Label color",
                type: "Color",
              },
              {
                name: "label_background_color",
                label: "Label background color",
                type: "Color",
              },
              {
                input_type: "section_header",
                label: "Real-time collaboration",
              },
              {
                name: "real_time_updates",
                label: "Real-time updates",
                type: "Bool",
                sublabel: "Enable real-time updates for drag-and-drop events.",
                default: true,
              },
              new FieldRepeat({
                name: "update_events",
                showIf: { real_time_updates: true },
                fields: [
                  {
                    type: "String",
                    name: "event",
                    label: req.__("Update event"),
                    sublabel: req.__(
                      "Custom event for real-time updates",
                    ),
                    attributes: {
                      options: triggers.map((t) => t.name),
                    },
                  },
                ],
              }),
            ],
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table = Table.findOne(table_id);
  const table_fields = table.fields;
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
      const sf = new Field(f);
      sf.required = false;
      return sf;
    });
};

const isWeekend = (date) => ((d) => d === 0 || d === 6)(date.getDay());

const is_live_reload = (req) =>
  req?.header && req.header["X-Saltcorn-Reload"] === "true";

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
    item_where,
    col_field_format,
    col_no_weekends,
    unallocated_col_label,
    unallocated_row_label,
    col_width,
    row_hdr_width,
    grid_color,
    label_background_color,
    label_color,
    real_time_updates,
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
    : public_user_role;
  const sview = await View.findOne({ name: show_view });
  if (!sview)
    return div(
      { class: "alert alert-danger" },
      "Kanban board incorrectly configured. Cannot find view: ",
      show_view
    );
  const item_where_wh = item_where ? jsexprToWhere(item_where, {}, fields) : {};
  const allocated_sresps = await sview.runMany(
    { ...item_where_wh, ...state },
    extraArgs
  );

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
  const row_where_wh = row_where ? jsexprToWhere(row_where, {}, fields) : {};
  const dvs = await row_fld.distinct_values(extraArgs.req, row_where_wh);
  for (const { label, value } of dvs) {
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
  const unalloc_area_width = 150;
  const tableWidth = col_width
    ? cols.length * col_width + row_hdr_width + unalloc_area_width
    : undefined;
  const view = View.findOne({ name: viewname });
  //console.log(Object.keys(by_row));
  //console.log(Object.keys(by_row[""]));
  const show_item = ({ row, html }) =>
    div(
      {
        class: "kancard card",
        "data-id": text(row.id),
        ...(expand_view && {
          onClick: `ajax_modal('/view/${expand_view}?id=${row.id}')`,
        }),
      },
      html
    ) + "\n";
  const inner = table(
    { class: "kanalloc table" },
    thead(
      tr(
        th(
          {
            style: {
              width: `${unalloc_area_width}px`,
            },
          },
          "Unallocated"
        ),
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
      Object.entries(by_row).map(([rv, colvs], i) =>
        tr(
          i === 0
            ? th(
                {
                  class: "unalloc alloctarget kantouchaction",
                  style: {
                    width: `${unalloc_area_width}px`,
                  },
                  rowSpan: row_vals.size,
                  "data-row-val": "",
                  "data-col-val": "null",
                },
                (by_row[""]["null"] || []).map(show_item)
              )
            : "",
          th(
            {
              class: "rowlbl",
              style: {
                width: row_hdr_width ? `${row_hdr_width}px` : defWidth,
              },
            },
            row_labels[rv]
          ),
          cols.map((c) =>
            c === null && rv === ""
              ? td({
                  style: {
                    width: col_width ? `${col_width}px` : defWidth,
                    backgroundColor: "grey",
                  },
                })
              : td(
                  {
                    style: {
                      width: col_width ? `${col_width}px` : defWidth,
                    },
                    class: "alloctarget kantouchaction",
                    "data-row-val": rv,
                    "data-col-val": c,
                  },
                  (colvs[c] || []).map(show_item)
                )
          )
        )
      )
    )
  );
  const rndid = Math.random().toString(36).substring(2, 10);
  const isLiveReload = is_live_reload(extraArgs.req);
  const initCode = `
  var onDone=function(){
    ${reload_on_drag ? "location.reload();" : ""}
  }
  var els=document.querySelectorAll('.alloctarget')
  const dragu = dragula(Array.from(els), {
    moves: function(el, container, handle) {
      return !el.className.includes('empty-placeholder')
    }
  }).on('drop', function (el,target, src,before) {
    var dataObj={ id: $(el).attr('data-id') }
    dataObj.${col_field}=$(target).attr('data-col-val');
    dataObj.${row_field}=$(target).attr('data-row-val');
    window.ignoreKanbanEvent${rndid} = true;
    view_post('${viewname}', 'set_card_value', dataObj, onDone);
  })
`;
  return div(
    { class: [], id: rndid },
    inner,
    //pre(JSON.stringify({table, name:table.name}))+
    style(`
    table.kanalloc { 
      table-layout: fixed;
      ${tableWidth ? `width: ${tableWidth}px;` : ""} 
    }
    table.kanalloc td, table.kanalloc th {
      border: 1px solid ${grid_color || `black`};
      border-collapse: collapse;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: top;
    }
    table thead th {
      padding: 3px;
      position: sticky;
      top: 0;
      z-index: 1;
      color:  ${label_color || `black`};
      background: ${label_background_color || `white`};
    }
    table.kanalloc thead th:first-child {
      position: sticky;
      left: 0;
      z-index: 2;
    }
    table.kanalloc thead th:nth-child(2) {
      position: sticky;
      left: ${unalloc_area_width}px;
      z-index: 2;
    }
    table.kanalloc tbody th.unalloc {
      position: sticky;
      left: 0;
      background: white;
      z-index: 1;
    }
    table.kanalloc tbody th.rowlbl {
      position: sticky;
      left: ${unalloc_area_width}px;
      background:  ${label_background_color || `white`};
      color:  ${label_color || `black`};
      z-index: 1;
    }
    .kantouchaction {
      touch-action: none;
    }
    `),

    script(
      domReady(`
        ${!isLiveReload ? initCode : ""}
        ${
          real_time_updates
            ? `
  const currentScript = document.getElementById('${rndid}');
  let realTimeView = currentScript?.closest(
    '[data-sc-embed-viewname="${view.name}"]'
  );

  const isMobile = parent?.saltcorn?.data?.state !== undefined;

  const viewLoader = async (url) => {
    let response = null;
    if (!isMobile) {
      response = await fetch(url, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "X-Saltcorn-Reload": "true",
          localizedstate: "true", //no admin bar
        },
      });
    }
    else {
      response = await parent.saltcorn.mobileApp.api.apiCall({
        method: "GET",
        path: url,
        additionalHeaders: {
          "X-Requested-With": "XMLHttpRequest",
          "X-Saltcorn-Reload": "true", //no admin bar
        },
      });
    }
    if (response.status === 200) {
      const template = document.createElement("template");
      template.innerHTML = !isMobile ? await response.text() : response.data;
      // find a div with an attribute "data-sc-embed-viewname"
      let result = Array.from(template.content.children).find(
        (child) =>
          child.getAttribute("data-sc-embed-viewname") === "${view.name}" ||
          child.querySelector("[data-sc-embed-viewname='${view.name}']")
      );
      if (result && !result.getAttribute("data-sc-embed-viewname"))
        result = result.querySelector("[data-sc-embed-viewname]");
      return result;
    } else {
      console.error(
        \`Failed to fetch view from \${url}: \${response.status} \${response.statusText}\`
      );
      return null;
    }
  };

  const updateKanbanView = async (viewElement) => {
    const urlAttr = (elem) =>
      elem?.getAttribute("data-sc-local-state") ||
      elem?.getAttribute("data-sc-view-source");
    let url = urlAttr(viewElement);
    let safeElement = viewElement;
    if (!url) {
      safeElement = viewElement.querySelector(
        "[data-sc-view-source], [data-sc-local-state]"
      );
      if (safeElement) {
        url = urlAttr(safeElement);
      } else {
        console.error("No data-sc-view-source found in the view element.");
        return null;
      }
    }
    const newViewElement = await viewLoader(url);
    if (!newViewElement) {
      console.error("No data-sc-embed-viewname found in the new view element.");
      return null;
    }
    safeElement.replaceWith(newViewElement);
    return newViewElement;
  };

  const handleRealTimeEvent = async (data) => {
    if (window.ignoreKanbanEvent${rndid}) {
      window.ignoreKanbanEvent${rndid} = false;
      return;
    }
    const result = await updateKanbanView(realTimeView);
    if (result) {
      realTimeView = result;
      ${initCode}
    }

    if (data.actions) {
      for (const action of data.actions) {
        if (realTimeView) await common_done(action, realTimeView);
        else await common_done(action, "${viewname}");
      }
    }
  };

  const collabCfg = {
    events: {
      '${view.getRealTimeEventName("UPDATE_EVENT")}': handleRealTimeEvent,
      '${view.getRealTimeEventName("INSERT_EVENT")}': handleRealTimeEvent,
      '${view.getRealTimeEventName("DELETE_EVENT")}': handleRealTimeEvent,
    },
  };
  init_collab_room('${view.name}', collabCfg);`
            : ""
        }`)
    ),
    script({
      src: `/static_assets/${db.connectObj.version_tag}/socket.io.min.js`,
    })
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
  const role = req.isAuthenticated() ? req.user.role_id : public_user_role;
  if (
    role > table.min_role_write &&
    !(table.ownership_field_id || table.ownership_formula)
  ) {
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

  await table.updateRow(
    updRow,
    parseInt(body.id),
    req.user || { role_id: public_user_role }
  );
  return { json: { success: "ok" } };
};

const virtual_triggers = (
  table_id,
  viewname,
  { row_field, col_field, real_time_updates, update_events }
) => {
  return real_time_updates
    ? [
        {
          when_trigger: "Insert",
          table_id: table_id,
          run: async (row, extra) => {
            const view = View.findOne({ name: viewname });
            if (view) {
              const actionResults = runCollabEvents
                ? await runCollabEvents(update_events, extra?.user, {
                    new_row: row,
                  })
                : [];
              view.emitRealTimeEvent("INSERT_EVENT", {
                ...row,
              });
            }
          },
        },
        {
          when_trigger: "Update",
          table_id: table_id,
          run: async (row, extra) => {
            if (
              row[row_field] !== extra.old_row[row_field] ||
              row[col_field] !== extra.old_row[col_field]
            ) {
              const view = View.findOne({ name: viewname });
              if (view) {
                const actionResults = runCollabEvents
                  ? await runCollabEvents(update_events, extra?.user, {
                      new_row: row,
                      old_row: extra.old_row,
                    })
                  : [];
                view.emitRealTimeEvent("UPDATE_EVENT", {
                  row: row,
                  actions: actionResults,
                });
              }
            }
          },
        },
        {
          when_trigger: "Delete",
          table_id: table_id,
          run: async (row, extra) => {
            const view = View.findOne({ name: viewname });
            if (view) {
              const actionResults = runCollabEvents
                ? await runCollabEvents(update_events, extra?.user, {
                    new_row: row,
                  })
                : [];
              view.emitRealTimeEvent("DELETE_EVENT", {
                row: row,
                actions: actionResults,
              });
            }
          },
        },
      ]
    : [];
};

module.exports = {
  name: "KanbanAllocator",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
  connectedObjects,
  routes: { set_card_value },
  virtual_triggers,
  mobile_render_server_side: true,
};

/*to do

1. time cols
*/
