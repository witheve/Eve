# Semantics

An Eve system consists of many processes: one server, one editor and multiple clients. The server is responsible for executing code and synchronising data between the editor and the clients.

The model we use to handle this is informed by the [single-writer principle](http://mechanical-sympathy.blogspot.com/2011/09/single-writer-principle.html). Every process may modify the data it owns but can only read data owned by other processes. Reading data from other processes is handled by the server, which propagates changes to all interested processes.

Suppose we have three processes: A, B and C. From the point of view of A, we know the following:

* Our view of data owned by A is perfectly up-to-date
* Our view of data owned by B or C is potentially stale
* Our view of data owned by B is a consistent snapshot of some point in time (ie after some tick on B)
* Our view of data owned by C is a consistent snapshot of some point in time (ie after some tick on C)
* Our views of B and C may be snapshots that occurred at different points in time and may contain decisions based on different views of the world

# Implementation

After each tick on the client/editor, clients/editors send a list of changes to their own state to the server. After each tick on the server, the server sends a list of all changes it has seen to all other processes. Processes ignore changes reported for data that they own, since it may be less recent than their own state.

By default, every view is owned by the server. Views tagged "editor" are owned by the editor. Views tagged "client" are partitioned by session id - each client owns only the rows corresponding to it's own session id. If a view is tagged client, it must have exactly one field tagged "session". These tags must be set when a view is created and never changed.
