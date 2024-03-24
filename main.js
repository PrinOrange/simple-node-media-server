import express from "express";
import fs, { existsSync } from "fs";
import multer from "multer";
import { nanoid } from "nanoid";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import cors from 'cors';

// 创建一个服务器，监听 3300 端口
const server = express();
server.listen(3300);
console.log("Server started.");
server.use(cors())  // 为了方便调试，允许跨域

/*
 *  定义一个处理上传表单文件的中间件
 *  它接收表单中 video 字段的单文件
 *  上传到临时目录 uploads-temp 目录中
 *  为了防止重名冲突，每个被上传的临时文件名都加上唯一前缀
 */
const copeUpload = multer({
  dest: "uploads-temp/",
  filename: function (req, file, cb) {
    const uniqueSuffix = nanoid();
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
}).single("video");

// 定义上传的 API 路由，并且使用上面的中间件
server.post("/upload", copeUpload, function (req, res, next) {
  const tempFilePath = path.resolve(req.file.path); // 视频上传后的临时文件位置
  const videoId = nanoid(); // 为视频资源创建唯一 ID
  const storageDirectory = path.resolve("storage", videoId); //为视频创建储存位置
  fs.mkdirSync(storageDirectory);

  ffmpeg(tempFilePath)
    .videoCodec("libx264")
    .audioCodec("aac")
    .addOption("-hls_time", 10)
    .addOption("-hls_segment_type", "mpegts")
    .addOption("-hls_list_size", 0)
    .format("hls")
    .addOption("-max_muxing_queue_size", 1024)
    .output(`${storageDirectory}/video.m3u8`)
    .on("start", function () {
      console.log("开始为视频切片");
    })
    .on("end", function () {
      fs.rmSync(tempFilePath); // 删除上传的临时文件
      console.log("切片完成");
    })
    .on("error", function (err) {
      fs.rmSync(tempFilePath); // 删除上传的临时文件
      console.error("切片失败:", err);
    })
    .run();

  res.json(`http://localhost:3300/play/${videoId}/video.m3u8`); //返回播放地址
});

server.get("/play/:videoId/:filename", (req, res) => {
  const videoId = req.params["videoId"]; // 从 URL 中获取视频 ID
  const storageDirectory = path.resolve("storage", videoId); // 视频切片和清单的储存位置
  if (!existsSync(storageDirectory)) {
    // 若目标视频记录不存在则返回 404
    res.status(404).send();
  }
  const filename = req.params["filename"]; //请求的文件
  const filepath = path.join(storageDirectory, filename);
  if (!existsSync(filepath)) {
    // 若目标文件不存在则返回 404
    res.status(404).send();
  }
  const data = fs.readFileSync(filepath); // 读取目标文件
  res.send(data);
});
