Start with the root of the todo app. This will be added to the DOM root.
  update
    [#section @todo class: "todoapp"]
  end
  
Draw the header. Here we add it as a child of @todo. We explicitly set ix to fix the draw order.
  todo = [@todo]
  update
    todo.children += [#header ix: 0, class: "header", children:
                         [#h1 text: "todos"]
                         [@todo-input #input class: "new-todo", placeholder: "What needs to be done?"]] 
  end

Draw the todo list. The list elements are repeated, one for every object in #todos
  choose
    [@app filtered]
    todos = [#todos title completed: filtered]
  or
    todos = [@todos title completed]
  end
  choose 
    completed = true
    completed-class = "completed"
  or
    completed = false
    completed-class = ""
  end
  choose
    completed-todos = [#todos completed: true]
    completed-todos-count = count(completed-todos given completed-todos)
    total-todos = count(todos given todos)
    completed-todos-count = total-todos
    all-complete = true   
  or
    all-complete = false
  end
  todo = [@todo]
  update
    todo.children := [#section ix: 1, class: "main", children: 
                        [@toggle-all #checkbox class: "toggle-all", checked: all-complete]
                        [#ul class: "todo-list"
                          [#li class: "{completed-class}" children: 
                            [#div class = "view" children: 
                              [#checkbox #toggle-todo todo: todos, class: "toggle", checked: completed]
                              [#label text: "{title}"]
                              [#button class: "destroy", todo: todos]]]]]
  end 

Draw the footer. This takes care of counting the TODOs and displays the filter buttons
  todos = [#todos completed: false]
  count = count(todos given todos)
  choose 
    count = 1
    item = "item"
  or 
    item = "items"
  end
  update
    @todo.children := [@footer #footer ix: 2, class: "footer", children:
                         [#span ix: 0, class: "todo-count", text: "{count} {item} left"] 
                         [#ul ix: 1, children:
                           [#li children: 
                             [@all-todos #a href: "#/", text: "All"]]
                           [#li children: 
                             [@active-todos #a href: "#/active", text: "Active"]]
                           [#li children: 
                             [@completed-todos #a href: "#/completed", text: "Completed"]]]]          
  end

Add a "clear completed" button to the footer only when there are completed tasks
  [#todos completed: true]
  footer = [@footer]
  update
    footer.children += [@clear-completed #button ix: 2, class: "clear-completed", text: "Clear Completed"]
  end

Eve listens for browser events and records them as facts in the database, which you can use as as any fact. For instance, I can listen for clicks on a certain element with the object 
  [#click element]
  
Or I can listen to keyboard presses with
  [#keyboard element key]
  
We can use a join to look at only keypresses in a certain element.
This will show keypresses only in the todo input box
  [#keyboard element: @todo-input, key]
  
So let's use that to build the control of our website

Save a todo on enter keypresses
  [@todo-input value]
  [#keyboard element: [@todo-input], key: "enter"]
  update session
    [#todo title: value, completed: "false"]
  end
  
Mark a todo completed when the checkbox is clicked
  [#click element]
  element = [#toggle-todo todo]
  todo = [#todos completed]
  update session
    todo.completed := !completed
  end
  
Remove completed totods when the "clear-completed" button is clicked
  [#click element: [@clear-completed]]
  todos = [#todos completed: true]
  update session
    todos -= todos
  end

Mark all todos as completed when the master checkbox is clicked
  [#click element: [@toggle-all]]
  toggle-all = [@toggle-all checked]
  update session
    #todos.completed := !checked
    toggle-all.checked := !checked
  end
  
Filter only active todos
  [#click element: [@active-todos]]
  app = [@app]
  update session
    app.filtered := false
  end

Filter only completed todos
  [#click element: [@completed-todos]]
  app = [@app]
  update session
    app.filtered := true
  end
  
Don't filter any elements
  [#click element: [@all-todos]]
  app = [@app]
  update session
    app.filtered := none 
  end