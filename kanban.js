const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const { jsexprToWhere } = require("@saltcorn/data/models/expression");
const Workflow = require("@saltcorn/data/models/workflow");
const { isWeb } = require("@saltcorn/data/utils");

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
const {
  stateFieldsToWhere,
  readState,
} = require("@saltcorn/data/plugin-helper");

const db = require("@saltcorn/data/db");
const { getState } = require("@saltcorn/data/db/state");

const { features } = require("@saltcorn/data/db/state");
const public_user_role = features?.public_user_role || 10;

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
              viewrow.name !== context.viewname,
          );
          const show_view_opts = show_views.map((v) => v.name);

          const expand_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname,
          );
          const expand_view_opts = expand_views.map((v) => v.name);

          const create_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewrow }) =>
              viewrow.name !== context.viewname &&
              state_fields.every((sf) => !sf.required),
          );
          const create_view_opts = create_views.map((v) => v.name);
          const swimlaneOptions = fields.map((f) => f.name);
          for (const field of fields) {
            if (field.is_fkey) {
              const reftable = Table.findOne({
                name: field.reftable_name,
              });
              if (reftable) {
                const reffields = await reftable.getFields();
                for (const f of reffields) {
                  swimlaneOptions.push(`${field.name}.${f.name}`);
                  if (f.is_fkey) {
                    const reftable2 = Table.findOne({
                      name: f.reftable_name,
                    });
                    if (reftable2) {
                      const reffields2 = await reftable2.getFields();
                      reffields2.forEach((f2) => {
                        swimlaneOptions.push(
                          `${field.name}.${f.name}.${f2.name}`,
                        );
                      });
                    }
                  }
                }
              }
            }
          }
          return new Form({
            fields: [
              {
                input_type: "section_header",
                label: "Views",
              },
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
                input_type: "section_header",
                label: "Columns",
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
                name: "col_width",
                label: "Column width",
                type: "Integer",
                sublabel: "Leave blank to divide the screen width evenly",
                attributes: { asideNext: true },
              },
              {
                name: "col_width_units",
                label: "Units",
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
                input_type: "section_header",
                label: "Card movement",
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
                name: "disable_card_movement",
                label: "Disable card movement",
                sublabel:
                  "Tick this to lock the ordering of the columns, but not the cards",
                type: "Bool",
              },
              {
                name: "reload_on_drag",
                label: "Reload page on drag",
                type: "Bool",
                showIf: { disable_card_movement: false },
              },
              {
                name: "disable_column_reordering",
                label: "Disable column re-ordering",
                sublabel:
                  "Tick this to lock the ordering of the columns, but not the cards",
                type: "Bool",
              },
              {
                input_type: "section_header",
                label: "Creating a new card",
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
                name: "create_at_top",
                label: "Create at top",
                type: "Bool",
                showIf: { view_to_create: create_view_opts },
              },
              {
                name: "create_label",
                label: "Label to create",
                default: "Add new card",
                type: "String",
                showIf: { view_to_create: create_view_opts },
              },
              {
                name: "create_view_display",
                label: "Display create view as",
                type: "String",
                required: true,
                attributes: {
                  options: "Link,Popup", //Embedded
                },
                showIf: { view_to_create: create_view_opts },
              },
              {
                input_type: "section_header",
                label: "Swimlanes",
              },
              {
                name: "swimlane_field",
                label: "Swimlane field",
                type: "String",
                attributes: {
                  options: swimlaneOptions,
                },
              },
              {
                name: "swimlane_height",
                label: "Swimlane height px",
                type: "Integer",
                default: 300,
                showIf: { swimlane_field: swimlaneOptions },
              },
              {
                name: "swimlane_where",
                label: "Where",
                class: "validate-expression",
                sublabel: "Only include swimlane rows matching this formula",
                type: "String",
                showIf: { swimlane_field: swimlaneOptions },
              },
              {
                name: "real_time_updates",
                label: "Real-time updates",
                type: "Bool",
                sublabel: "Enable real-time updates for drag-and-drop events",
                default: true,
                showIf: { disable_card_movement: false },
              },
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
  for (const k of Object.keys(obj).sort()) {
    if (!keyList.includes(k)) entries.push([k, obj[k]]);
  }
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
    overflow-x: ${col_width ? "auto" : "clip"};
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
  disable_column_reordering,
  swimlane_field,
  disable_card_movement,
  rndid,
) => `
  const swimlane_field=${JSON.stringify(swimlane_field)};
  var getColumnValues=function() {
    var vs = []
    $('.kancontainer').each(function(){
      vs.push($(this).attr('data-column-value'))
    })
    return vs
  }
  var onDone=(el,target, src,before)=> (res)=> {
    ${reload_on_drag ? "location.reload();" : ""}
    if(res.error){
      $(el).detach();
      $(src).append(el)
    }
  }
  var reportColumnValues=function(){
    window.ignoreKanbanEvent${rndid} = true;
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
  ${
    disable_card_movement
      ? ""
      : `
  var els=document.querySelectorAll('.kancontainer')
  var cardDragula = dragula(Array.from(els), {
    moves: function(el, container, handle) {
      return !el.className.includes('empty-placeholder')
    }
  }).on('drop', function (el,target, src,before) {
    var dataObj={ id: $(el).attr('data-id'),
                  before_id: before ? $(before).attr('data-id') : null }
    dataObj.${column_field}=$(target).attr('data-column-value')
    if(swimlane_field) {
      dataObj[swimlane_field]=$(target).attr('data-swimlane-value')
    }
    window.ignoreKanbanEvent${rndid} = true;
    view_post('${viewname}', 'set_card_value', dataObj, onDone(el,target, src,before));
  })`
  }`;

const realtTimeUpdater = (view, rndid, initCode) => `
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
      return template.content.children[0];
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

    let newViewElement = await viewLoader(url); 
    if (!newViewElement.getAttribute("data-sc-embed-viewname"))
      newViewElement = newViewElement.querySelector("[data-sc-embed-viewname]");
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
  };

  const collabCfg = {
    events: {
      '${view.getRealTimeEventName("UPDATE_EVENT")}': handleRealTimeEvent,
      '${view.getRealTimeEventName("INSERT_EVENT")}': handleRealTimeEvent,
      '${view.getRealTimeEventName("DELETE_EVENT")}': handleRealTimeEvent,
      '${view.getRealTimeEventName("CONFIG_EVENT")}': handleRealTimeEvent,
    },
  };
  init_collab_room('${view.name}', collabCfg);`;

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

const position_setter = (position_field, maxpos) =>
  position_field ? `&${position_field}=${Math.round(maxpos) + 2}` : "";

const is_live_reload = (req) =>
  req?.header && req.header["X-Saltcorn-Reload"] === "true";

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
    swimlane_where,
    swimlane_height,
    create_at_top,
    create_view_display,
    create_label,
    disable_card_movement,
    real_time_updates,
  },
  state,
  extraArgs,
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  readState(state, fields);
  const role = extraArgs.req.isAuthenticated()
    ? extraArgs.req.user.role_id
    : public_user_role;
  const sview = await View.findOne({ name: show_view });
  if (!sview)
    return div(
      { class: "alert alert-danger" },
      "Kanban board incorrectly configured. Cannot find view: ",
      show_view,
    );
  const forUser = {
    forUser: extraArgs.req.user || { role_id: public_user_role },
    forPublic: !extraArgs.req.user,
  };
  const sresps = await sview.runMany(state, extraArgs);
  if (position_field)
    await assign_random_positions(sresps, position_field, table_id);
  let cols = groupBy(sresps, ({ row }) => row[column_field]);
  let restrictColsTo;
  //filter columns in some cases
  for (const [k, v] of Object.entries(state)) {
    const kpath = k.split(".");
    if (kpath.length === 4) {
      const [jtNm, jFieldNm, tblName, lblField] = kpath;
      if (jtNm === table.name && jFieldNm === column_field) {
        //bingo.

        const validColRows = await Table.findOne({ name: tblName }).getRows(
          {
            [lblField]: v,
          },
          forUser,
        );
        restrictColsTo = new Set(validColRows.map((r) => r.id));
      }
    }
  }
  const use_column_order = [...new Set(column_order)];
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
    const refRows = await reftable.getRows({}, forUser);
    refRows.forEach((r) => {
      if (cols[r.id]) {
        cols[r[column_field_field.attributes.summary_field]] = cols[r.id];
        delete cols[r.id];
      } else if (!restrictColsTo || restrictColsTo.has(r.id))
        cols[r[column_field_field.attributes.summary_field]] = [];
      originalColNames[r[column_field_field.attributes.summary_field]] = r.id;
    });
  }

  const ncols = Object.entries(cols).length;
  const sortCol = position_field
    ? (vs) => vs.sort((a, b) => a.row[position_field] - b.row[position_field])
    : (vs) => vs;
  let state_fields_qs = "";
  Object.entries(state).forEach(([k, v]) => {
    state_fields_qs += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  });
  const get_col_divs =
    (swimVal) =>
    ([hdrName, vs]) => {
      let maxpos = -1000000;
      let href = `/view/${text(view_to_create)}?${text_attr(
        column_field,
      )}=${text_attr(originalColNames[hdrName] || hdrName)}${position_setter(
        position_field,
        maxpos,
      )}${
        swimlane_field ? `&${swimlane_field}=${swimVal}` : ""
      }${state_fields_qs}`;
      if (create_view_display === "Popup")
        href = `javascript:ajax_modal('${href}')`;
      else if (!isWeb(extraArgs.req) && create_view_display === "Link")
        href = `javascript:execLink('${href}')`;
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
            { class: "card-header d-flex justify-content-between" },
            h6({ class: "card-title" }, text_attr(hdrName)),
            view_to_create &&
              role <= table.min_role_write &&
              create_at_top &&
              a(
                {
                  class: "card-link",
                  href,
                },
                i({ class: "fas fa-plus-circle me-1" }),
              ),
          ),
          div(
            {
              class: "kancontainer",
              "data-column-value": text_attr(hdrName),
              "data-swimlane-value": swimlane_field
                ? text_attr(swimVal)
                : undefined,
            },
            div(
              {
                class: "kancard kancard-empty-placeholder",
              },
              i("(empty)"),
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
                      onClick: `ajax_modal('/view/${expand_view}?id=${row.id}')`, // TODO
                    }),
                  },
                  html,
                ) + "\n"
              );
            }),
          ),
          view_to_create &&
            role <= table.min_role_write &&
            !create_at_top &&
            div(
              { class: "card-footer" },
              a(
                {
                  class: "card-link",
                  href,
                },
                i({ class: "fas fa-plus-circle me-1" }),
                create_label || "Add new card",
              ),
            ),
        ),
      );
    };
  let inner;
  if (swimlane_field) {
    let dvs = [];
    let swimlane_accesssor = (r) => r[swimlane_field];
    let filterColumnsField;
    let columnFilterData;
    if (swimlane_field.includes(".")) {
      const joinData = {};
      const joinFields = {};
      const kpath = swimlane_field.split(".");
      if (kpath.length === 2) {
        const [refNm, targetNm] = kpath;
        const refField = fields.find((f) => f.name === refNm);
        const refTable = Table.findOne({ name: refField.reftable_name });
        const refFields = await refTable.getFields();
        const target = refFields.find((f) => f.name === targetNm);
        const swimlane_where_wh = swimlane_where
          ? jsexprToWhere(swimlane_where, {}, refFields)
          : {};
        if (state[refNm]) {
          dvs = await target.distinct_values(extraArgs.req, {
            [refTable.pk_name]: state[refNm],
            ...swimlane_where_wh,
          });
          dvs = dvs.filter((dv) => dv.value);
        } else {
          dvs = await target.distinct_values(extraArgs.req, swimlane_where_wh);
        }
        joinFields[`_swimlane`] = {
          ref: refNm,
          target: targetNm,
        };
      } else if (kpath.length === 3) {
        const [refNm, throughNm, targetNm] = kpath;
        const refField = fields.find((f) => f.name === refNm);
        const refTable = Table.findOne({ name: refField.reftable_name });
        const refFields = await refTable.getFields();
        const through = refFields.find((f) => f.name === throughNm);
        const throughTable = Table.findOne({ name: through.reftable_name });
        const throughFields = await throughTable.getFields();
        const target = throughFields.find((f) => f.name === targetNm);
        const swimlane_where_wh = swimlane_where
          ? jsexprToWhere(swimlane_where, {}, throughFields)
          : {};
        dvs = await target.distinct_values(extraArgs.req, swimlane_where_wh);
        joinFields[`_swimlane`] = {
          ref: refNm,
          through: throughNm,
          target: targetNm,
        };
        if (refNm === column_field) {
          // in this case we only want to show columns for this field value
          filterColumnsField = refNm;
          const colrows = await refTable.getJoinedRows({
            joinFields: {
              _column: {
                ref: throughNm,
                target: targetNm,
              },
            },
            ...forUser,
          });
          columnFilterData = {};
          colrows.forEach((colrow) => {
            if (!columnFilterData[colrow._column])
              columnFilterData[colrow._column] = new Set();
            columnFilterData[colrow._column].add(
              colrow[refField.attributes.summary_field],
            );
          });
        }
      }
      swimlane_accesssor = (row) => joinData[row.id]._swimlane;
      //do the query and create joinData
      const qstate = await stateFieldsToWhere({ fields, state });

      const joinRows = await table.getJoinedRows({
        where: qstate,
        joinFields,
        ...forUser,
      });
      joinRows.forEach((r) => {
        joinData[r.id] = r;
      });
    } else {
      const slField = fields.find((f) => f.name === swimlane_field);
      dvs = await slField.distinct_values();
      if (state[swimlane_field]) {
        dvs = dvs.filter((dv) => dv.value === state[swimlane_field]);
      }
    }
    //console.log(cols.ToDo[0].row, swimlane_accesssor(cols.ToDo[0].row));
    inner = dvs.map(({ label, value }) => {
      const mycols = {};
      //console.log({ label, value });
      Object.keys(cols).forEach((k) => {
        if (
          columnFilterData &&
          (!columnFilterData[value] || !columnFilterData[value].has(k))
        )
          return;
        mycols[k] = cols[k].filter(
          ({ row }) =>
            swimlane_accesssor(row) === value ||
            (!value && !swimlane_accesssor(row)),
        );
      });

      const col_divs = orderedEntries(mycols, use_column_order || []).map(
        get_col_divs(value),
      );

      if (col_divs.length === 0) return "";
      return div(
        {
          class: "kanswimlane",
          "data-swimlane-value": swimlane_field ? text_attr(label) : undefined,
        },
        h5({ class: "swimlanehdr" }, text(label)),
        hr(),
        div(
          {
            class: "kanswimcontents ps-3 pe-2",
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
            col_divs,
          ),
        ),
      );
    });
  } else {
    const col_divs = orderedEntries(cols, use_column_order || []).map(
      get_col_divs(null),
    );
    inner = div(
      {
        class: [
          "kanboard",
          col_width ? "setwidth" : `row row-cols-${col_divs.length}`,
        ],
      },
      col_divs,
    );
  }
  const rndid = Math.random().toString(36).substring(2, 10);
  const initCode =
    role <= table.min_role_write
      ? js(
          table.name,
          column_field,
          viewname,
          reload_on_drag,
          disable_column_reordering,
          swimlane_field,
          disable_card_movement,
          rndid,
        )
      : "";
  const view = View.findOne({ name: viewname });
  const isLiveReload = is_live_reload(extraArgs.req);
  return div(
    { class: ["kanboardwrap", col_width ? "setwidth" : ""] },
    inner,
    //pre(JSON.stringify({table, name:table.name}))+
    style(
      css({ ncols, col_bg_color, col_text_color, col_width, col_width_units }),
    ),
    !isLiveReload && script(domReady(initCode)),
    !isLiveReload && real_time_updates
      ? script({
          src: `/static_assets/${db.connectObj.version_tag}/socket.io.min.js`, // TODO
        }) +
          script(
            { id: rndid },
            domReady(realtTimeUpdater(view, rndid, initCode)),
          )
      : "",
  );
};

const connectedObjects = async ({
  create_view_display,
  view_to_create,
  show_view,
  expand_view,
}) => {
  const linkedViews = [];
  const embeddedViews = [];
  const viewToCreate = view_to_create
    ? View.findOne({ name: view_to_create })
    : undefined;
  if (viewToCreate) {
    if (create_view_display === "Link") linkedViews.push(viewToCreate);
    else embeddedViews.push(viewToCreate);
  }
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
  { req },
) => {
  const table = await Table.findOne({ id: table_id });
  const role = req.isAuthenticated() ? req.user.role_id : public_user_role;
  if (
    role > table.min_role_write &&
    !(table.ownership_field_id || table.ownership_formula)
  ) {
    return { json: { error: "not authorized" } };
  }
  const forUser = {
    forUser: req.user || { role_id: public_user_role },
    forPublic: !req.user,
  };
  let colval = body[column_field];
  const fields = await table.getFields();
  const column_field_field = fields.find((f) => f.name === column_field);
  if (column_field_field && column_field_field.type === "Key") {
    const reftable = await Table.findOne({
      name: column_field_field.reftable_name,
    });
    const refrow = await reftable.getRow(
      {
        [column_field_field.attributes.summary_field]: body[column_field],
      },
      forUser,
    );
    colval = refrow.id;
  }
  const updRow = { [column_field]: colval };
  if (position_field) {
    var newpos;
    const exrows = await table.getRows(
      { [column_field]: colval },
      { orderBy: position_field, ...forUser },
    );
    const before_id = body.before_id;
    if (before_id) {
      const before_ix = exrows.findIndex((row) => row.id == before_id);
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
  const upres = {};
  await table.updateRow(
    updRow,
    body.id,
    req.user || { role_id: public_user_role },
    false,
    upres,
  );
  const view = View.findOne({ name: viewname });
  return { json: { success: "ok", ...upres } };
};

//whole column has been moved
const set_col_order = async (table_id, viewname, config, body, { req }) => {
  const table = await Table.findOne({ id: table_id });

  const role = req.isAuthenticated() ? req.user.role_id : public_user_role;
  if (role > table.min_role_write) {
    return { json: { error: "not authorized" } };
  }
  const view = await View.findOne({ name: viewname });
  const newConfig = {
    configuration: { ...view.configuration, column_order: [...new Set(body)] },
  };
  await View.update(newConfig, view.id);
  await getState().refresh_views(); // view update uses noSignal
  view.emitRealTimeEvent("CONFIG_EVENT", {});
  return { json: { success: "ok", newconfig: newConfig } };
};

const virtual_triggers = (table_id, viewname, { real_time_updates }) => {
  return real_time_updates
    ? [
        {
          when_trigger: "Insert",
          table_id: table_id,
          run: (row) => {
            const view = View.findOne({ name: viewname });
            if (view) {
              view.emitRealTimeEvent("INSERT_EVENT", {
                ...row,
              });
            }
          },
        },
        {
          when_trigger: "Update",
          table_id: table_id,
          run: (row) => {
            const view = View.findOne({ name: viewname });
            if (view) {
              view.emitRealTimeEvent("UPDATE_EVENT", {
                ...row,
              });
            }
          },
        },
        {
          when_trigger: "Delete",
          table_id: table_id,
          run: (row) => {
            const view = View.findOne({ name: viewname });
            if (view) {
              view.emitRealTimeEvent("DELETE_EVENT", {
                ...row,
              });
            }
          },
        },
      ]
    : [];
};

module.exports = {
  name: "Kanban",
  display_state_form: false,
  mobile_server_side: true,
  get_state_fields,
  configuration_workflow,
  run,
  connectedObjects,
  routes: { set_col_order, set_card_value },
  virtual_triggers,
};
