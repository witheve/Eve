routing
  [#url segment: [ix: 1, value]]
  update
    [@app filter: value]

handle insert
  [#keydown element: [@new-todo value] key: "enter"]
  update history
    [#todo body: value, completed: false, editing: false]

handle edit
  choose [#double-click element: [#todo-item todo]], editing = true, body = todo.body, completed = todo.completed
      or [#keydown element: [#todo-editor todo] key: "escape"], editing = false, body = todo.body, completed = todo.completed
      or [#keydown element: [#todo-editor todo value] key: "enter", value], editing = false, body = value, completed = false
      or [#blur element: [#todo-editor todo value]], editing = false, body = todo.body, completed = todo.completed
      or [#click element: [#todo-checkbox todo]], editing = false, body = todo.body, completed = toggle(todo.completed)
      or [#click element: [@toggle-all checked]], todo = [#todo editing, body], completed = checked
  update history
    todo := [editing, body, completed]

handle removes
  choose [#click element: [#remove-todo todo]]
      or [#click element: [@clear-completed]], todo = [#todo completed: true]
  update history
    todo := none

draw todomvc
  [@app filter]
  choose filter = "completed", completed = true
         todo = [#todo body, completed, editing]
      or filter = "active", completed = false
         todo = [#todo body, completed, editing]
      or todo = [#todo body, completed, editing] end
  choose not [#todo completed: false] end, all-checked = true
      or all-checked = false end
  count = count(given [#todo completed: false])
  hide-clear-completed = count(given [#todo completed: true]) == 0
  [#pluralize number: count, singular: "item left", plural: "items left" text: count-text]

  update
    [#div @todoapp children:
      [#header children:
        [#h1 text: "todos"]
        [#input @new-todo, autofocus: true, placeholder: "What needs to be done?"]]
      [#div @main children:
        [#input @toggle-all, type: "checkbox", checked: all-checked]
        [#ul @todo-list children:
          [#li, class: [todo: true, completed, editing], todo, children:
            [#input #todo-check, class: "toggle", type: "checkbox", checked: completed]
            [#label #todo-item, text: body, todo]
            [#button #remove-todo todo]
            [#input #todo-editor, style: [display: editing], todo, value: body]]]]
      [#footer children:
        [#span @todo-count children: [#strong text: count] [#span text: count-text]]
        [#ul @filters
          [#li children: [#a href: "#/all" class: [selected: filter == "all"] text: "all"]]
          [#li children: [#a href: "#/active" class: [selected: filter == "active"] text: "active"]]
          [#li children: [#a href: "#/completed" class: [selected: filter == "completed"] text: "completed"]]]
        [#button @clear-completed, style: [display: toggle(hide-clear-completed)] text: "Clear completed"]]]