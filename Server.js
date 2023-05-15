import express from 'express';
import multer from 'multer';
import path from 'path';
import mariadb from 'mariadb';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = mariadb.createPool({
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PWD,
    database: process.env.DB,
});




app.listen(3000, () => {
    console.log("開始監聽port 3000!");
});



//檔案儲存設定
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        //分離舊檔名與副檔名
        const ext = path.extname(file.originalname);

        //解碼已編碼的 URI 字串
        //並以"舊檔名-現在時間"作為檔案儲存之檔名 => 以避免撞檔名
        const fileName = decodeURIComponent(escape(file.originalname)).replace(ext, '').toLowerCase().split(' ').join('-') + '-' + Date.now();

        cb(null, fileName + ext);
    }
});



//上傳檔案工具
const maxSize = 5 * 1024 * 1024; //5MB
const fileUploader = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.originalname.length > 80) { //檔名不可超過80字
            cb(new multer.MulterError("LIMIT_FILENAME_SIZE"));
        }
        //word => .docx or .doc
        //pdf => .pdf
        else if ((
                file.fieldname === 'word' &&
                (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                    file.mimetype === 'application/msword'
                )
            ) ||
            (file.fieldname === "pdf" && file.mimetype === 'application/pdf')
        ) {
            cb(null, true);
        } else {
            cb('Only WORD/PDF files are allowed');
        }
    },
    limits: { fileSize: maxSize },
});


const uploadAnswersForm = fileUploader.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'word', maxCount: 1 }
]);


app.post('/upload',
    async(req, res) => {
        uploadAnswersForm(req, res, async function(err) {
            if (err) {
                if (err.code == "LIMIT_FILE_SIZE") { //檔案大小過大
                    res.status(413).send("LIMIT_FILE_SIZE");
                } else if (err.code == "LIMIT_FILENAME_SIZE") {
                    res.status(413).send("LIMIT_FILENAME_SIZE");
                } else {
                    // An unknown error occurred when uploading.
                    res.status(500).send();
                }
            } else {
                //資料標題
                const title = req.body["title"];
                //上傳結果
                let conn;
                let statusCode;
                try {
                    const wordFilename = req.files["word"][0].filename;
                    const pdfFilename = req.files["pdf"][0].filename;
                    conn = await pool.getConnection();
                    await conn.query('INSERT INTO answers (title,word,pdf) VALUES (?,?,?)', [title, wordFilename, pdfFilename]);
                    statusCode = 200;
                } catch (err) {
                    // Manage Errors
                    console.log("SQL error : ", err);
                    statusCode = 500;
                } finally {
                    // Close SQL resources
                    if (conn) conn.end();
                    res.status(statusCode).send();
                }
            }
        });

    });


app.get('/answersTable', async(req, res) => {
    let conn;
    let rows;
    try {
        conn = await pool.getConnection();
        rows = await conn.query('SELECT * FROM answers');
    } catch (err) {
        console.error("Error Processing Query: ", err);
    } finally {
        if (conn) conn.end();
        res.send(rows);
    }
});