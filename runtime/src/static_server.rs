use std::io::{Read, Write};
use std::io;
use std::fs::File;
use hyper;
use hyper::net::Fresh;
use hyper::server::{Server, Request, Response};
use hyper::uri::RequestUri;
use hyper::Url;
use hyper::header::ContentType;
use mime::Mime;
use url::SchemeData::Relative;
use std::path::Path;
use std::fs::PathExt;
use conduit_mime_types::Types;
use std::str::FromStr;

// The static file server is responsible for serving static files for the editor and clients
// TODO needs review

pub fn run(socket_addr: ::std::net::SocketAddr) {

    // TODO high thread-count is a workaround for https://github.com/hyperium/hyper/issues/368
    Server::http(socket_addr).unwrap().handle_threads(serve, 100).unwrap();
}

fn read_file_bytes(filename: &str) -> Vec<u8> {
    let mut file = File::open(&filename).unwrap();
    let mut contents: Vec<u8> = Vec::new();
    file.read_to_end(&mut contents).unwrap();
    contents
}

fn file_exists(path: &Path) -> bool {
    path.is_file() && path.exists()
}

fn serve_file(mut res: Response<Fresh>, path: &Path) -> io::Result<()> {
    let mime_types = Types::new().unwrap();

    let file_path = if file_exists(path) {
        path
    } else {
        // The resource is not found. Set a 404 error status and return the 404 page
        *res.status_mut() = hyper::status::StatusCode::NotFound;
        Path::new("../ui/404.html")
    };

    let file = read_file_bytes(file_path.to_str().unwrap());

    let mime: Mime = Mime::from_str(mime_types.mime_for_path(Path::new(file_path))).unwrap();
    res.headers_mut().set(ContentType(mime));
    let mut res = try!(res.start());
    try!(res.write_all(&file));
    try!(res.end());
    Ok(())
}

fn serve(req: Request, mut res: Response<Fresh>) {

    match (&req.method.clone(), &req.uri.clone()) {
        (&hyper::Get, &RequestUri::AbsolutePath(ref request_uri)) => {

            // form a full URL from the requestred URI
            let absolute_path = "http://localhost".to_string() + request_uri;
            let url = Url::parse(&*absolute_path).unwrap();

            // extract requested filename from the URL
            let path_info = match url.scheme_data {
                Relative(path_info) => path_info,
                _ => panic!("Expected Relative URL scheme"),
            };

            let serialized_path = path_info.serialize_path();
            let relative_path = Path::new(&*serialized_path);
            let requested_file = match relative_path.file_name() {
                Some(file_name) => file_name.to_str().unwrap(),
                None => "",
            };

            // Everything is in ../ui
            let corrected_path = path_info.path.iter().fold("../ui".to_owned(), |end, cur| end + "/" + cur);
            let relative_path = Path::new(&*corrected_path);

            // serve the requested file
            match requested_file {
                "editor.html" | "editor" | "" => {
                    if let Err(error) = serve_file(res, Path::new("../ui/editor.html")) {
                        println!("Warning: serve error {:?}", error);
                    }
                },
                _ => {
    				if let Err(error) = serve_file(res, relative_path) {
    					println!("Warning: serve error {:?}", error);
    				}
                }
            };
        }
        _ => *res.status_mut() = hyper::status::StatusCode::MethodNotAllowed,
    }
}