module.exports = {
    apps : [{
      name   : "YoutubeDL-Material",
      script : "./app.js",
      instances: 0,
      exec_mode: "cluster",
      watch  : "placeholder",
      out_file: "/dev/null",
      error_file: "/dev/null"
    }]
}