## Persistence

Eve uses [event sourcing](http://www.confluent.io/blog/making-sense-of-stream-processing/) for persistence. Every change event received from the editor or clients is appended to eve/runtime/autosave. Eve is completely deterministic so it can recover from crashes by simply rerunning the file.

Code is currently also stored in the events file. (Roadmap: [version control](http://incidentalcomplexity.com/2015/04/22/version-control/))

## Watchers

Eve programs are pure functions of their input tables. To handle I/O we add __watchers__ which read commands from the program and insert new data. For example, a file watcher might:

* See ["my_awesome_file.txt"] in the 'files to open' table
* Add ["my_awesome_file.txt", "14:07.369"] to the 'files being opened' table
* Asynchronusly open the file
* ... program continues running ...
* Remove ["my_awesome_file.txt", "14:07.369"] from the 'files being opened' table
* Add ["my_awesome_file.txt", "14:07.369", "14:07.780", "my awesome contents..."] to the 'files opened' table

This barrier between pure views and watchers has a lot of benefits. We can easily disable/pause I/O while editing or mock I/O for testing. Untrusted programs can be sandboxed easily in normal code just by filtering their output views. We can replay any part of history by feeding in recorded results in place of real I/O. All of this is _possible_ in other languages, but by exposing it easily we hope to make it more commonly used.

## UI

There is an experimental immediate-mode UI watcher that we used to build our [foursquare clone](http://incidentalcomplexity.com/2015/07/02/march-april-may-june/). A dedicated UI editor is used to build a template for each page and bind view fields to values on the page. The watcher detects changes to those views and incrementally modifies the DOM to match.

(Roadmap: restore the UI editor)

## Communication

Eve programs can also communicate directly with each other. The state of each program is treated as if it exists in a single global namespace. The model we use to handle this is informed by the [single-writer principle](http://mechanical-sympathy.blogspot.com/2011/09/single-writer-principle.html). Every process may modify the data it owns but can only read data owned by other processes. Reading data from other processes is handled by the server, which propagates changes to all interested processes.

Suppose we have three processes: A, B and C. From the point of view of A, we know the following:

* Our view of data owned by A is perfectly up-to-date
* Our view of data owned by B or C is potentially stale
* Our view of data owned by B is a consistent snapshot of some point in time (ie after some tick on B)
* Our view of data owned by C is a consistent snapshot of some point in time (ie after some tick on C)
* Our views of B and C may be snapshots that occurred at different points in time and may contain decisions based on different views of the world

In the current setup an Eve system consists of one server, one editor and zero or more clients. The server is responsible for executing code and synchronising data between the editor and the clients. (Roadmap: client-side execution, full p2p communication)

After each tick on the client/editor, clients/editors send a list of changes to their own state to the server. After each tick on the server, the server sends a list of all changes it has seen to all other processes. Processes ignore changes reported for data that they own, since it may be less recent than their own state.

By default, every view is owned by the server. Views tagged "editor" are owned by the editor. Views tagged "client" are partitioned by session ID - each client owns only the rows corresponding to it's own session ID. If a view is tagged "client" then it must have a field tagged "session". These tags must be set when a view is created and never changed.

## Protocol

Messages contain a list of changes to tables and a list of commands.

``` js
{
    "changes":[
        [
            // table id
            "editor node position",
            // fields ids
            ["editor node position: node","editor node position: x","editor node position: y"],
            // rows to insert
            [
                ["0979c858-7f66-4ca9-80dd-f4706a101a42",328.52798735275485,225.23641929236112],
                ["1f02b281-053d-48bd-8363-591f93aa1124",473.2407921698831,340.2223032513399],
                ["595c7e17-a5bd-4d2c-9e6ee40faecf0499",400.13438976131897,282.7293612718505]
            ],
            // rows to remove
            []
        ]
    ],
    "commands": [
        ["save", "my_save_file.eve"]
    ]
}
```

Commands are used only for side-effects that cannot yet be handled by watchers - currently these are ["load", filename] and ["save", filename] which will be unneccesary once we have version control.

(Roadmap: switch to a binary protocol)

## Authentication and identity

We've done some experiments with authentication using [AuthRocket](https://authrocket.com/), but have removed it for now. The login process handled the exchange with authrocket and inserted auth data into tables on the server. This data is then available to the program when deciding what data to render. (Roadmap: friendly interface to auth)

Currently, the communication between clients and the server is totally unprotected and clients have access to all data in the system. (Roadmap: whitelist client access on a row by row basis)

