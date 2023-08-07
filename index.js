const TeleBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const moment = require("moment");
const path = require("path");
const AdmZip = require("adm-zip");

// development mode
const devMode = true;
function debug(message) {
	if (devMode == true) {
		console.log("debug: " + message);
	}
}

require("dotenv").config();
const TOKEN = process.env.BOT_TOKEN;
const bot = new TeleBot(TOKEN, { polling: true });

bot.on("message", async (msg) => {
	if (msg.document.file_name.toLowerCase() == "subtitle.zip") {
		parseSubtitle(msg);
	}
});

// FUNCTION
const parseSubtitle = async (msg) => {
	// save file subtitle.zip dengan nama {time}@susbtitle.zip ke ./files
	const chatId = msg.chat.id;
	const fileId = msg.document.file_id;
	const fileName = msg.document.file_name;
	const fileExt = fileName.split(".").pop();
	const timestamp = moment().format("HH.mm.ss_DD.MM.YYYY");
	const newFileName = `${timestamp}@${fileName}`;
	try {
		const fileLink = await bot.getFileLink(fileId);

		// Mendownload file dari tautan
		const response = await axios.get(fileLink, { responseType: "stream" });
		const filePath = `./files/${newFileName}`;

		// Menyimpan file dengan nama baru
		const writeStream = fs.createWriteStream(filePath);
		response.data.pipe(writeStream);
		debug("menyimpan file.");

		// Menunggu hingga proses penyimpanan selesai
		await new Promise((resolve, reject) => {
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
		});

		// encode.base64 nama file dan buat folder ./temp/{namaFile}
		const nameEncoded = Buffer.from(newFileName).toString("base64");
		function extractZip(callback) {
			fs.mkdirSync(`./temp/${nameEncoded}`);
			// ekstrak file subtitle ke ./temp/{namaFile}
			const zipFilePath = `./files/${newFileName}`; // Ganti dengan path berkas ZIP Anda
			const targetFolderPath = `./temp/${nameEncoded}`; // Ganti dengan path folder tempat Anda ingin mengekstrak berkas
			const zip = new AdmZip(zipFilePath);
			const extractionPath = path.resolve(targetFolderPath); // Memastikan path absolut dari target folder
			zip.extractAllTo(extractionPath, /*overwrite*/ true);
			callback();
		}

		function mixSub() {
			function srt2ass(arr, style) {
				const path = fs.readFileSync(arr, "utf8");
				const pattern = /\r?\n\r?\n/;
				const matches = path.split(pattern);
				let srtData = [];
				matches.forEach((el) => {
					const text = el;
					const parts = text.split("\r\n");
					if (parts[1]) {
						const time = parts[1].split(" --> ");
						const result = {
							id: parts[0],
							start: time[0].replace(",", "."),
							end: time[1].replace(",", "."),
							text: parts.slice(2).join("\r\n"),
						};
						srtData.push(result);
					}
				});

				function parse(el, data) {
					if ((el == "start") | (el == "end")) {
						const part = data.split(":");
						const h = part[0][1];
						const m = part[1];
						const s = part[2].split(".")[0];
						const ms = part[2].split(".")[1].slice(0, 2);
						return `${h}:${m}:${s}.${ms}`;
					} else if (el == "text") {
						let part = data.replace(/\r\n|\n/g, "\\N");
						return part.replace(/<[^>]*>/g, "");
					}
				}

				let res = [];
				srtData.forEach((el) => {
					let line = `Dialogue: 0,${parse("start", el["start"])},${parse(
						"end",
						el["end"]
					)}, ${style},,0000,0000,0000,,${parse("text", el["text"])}\n`;

					res.push(line);
				});

				return res;
			}

			function mix() {
				const subPath = `./temp/${nameEncoded}`;
				const files = fs.readdirSync(subPath);
				const x = srt2ass(`${subPath}/${files[0]}`, "Middle");
				const y = srt2ass(`${subPath}/${files[1]}`, "Bottom");
				const headerAss = `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayDepth: 0
Timer: 100,0000
Video Aspect Ratio: 0
WrapStyle: 0
ScaledBorderAndShadow: no

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,Arial,16,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,10,0
Style: Top,Arial,16,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,8,10,10,10,0
Style: Middle,Arial,18,&H0000FFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,5,10,10,10,0
Style: Bottom,Arial,18,&H00F9FFF9,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,10,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:01:00.00, Top,,0000,0000,0000,,MIX BY NORI07 | https://nori.my.id
`;

				let mix = "";
				mix += headerAss;
				const maxLength = Math.max(x.length, y.length);

				for (let i = 0; i < maxLength; i++) {
					if (i < x.length) {
						// mix.push(x[i]);
						mix += x[i];
					}
					if (i < y.length) {
						// mix.push(y[i]);
						mix += y[i];
					}
				}

				fs.writeFileSync(`./temp/${nameEncoded}/subtitle MIX.ass`, mix);
			}

			mix();
		}

		// parse subtitle srt ke ass
		extractZip(() => {
			mixSub();
		});

		// compress ass
		// send file compress ke user

		// Fungsi untuk mengirim dokumen
		function sendDocument(chatId, documentPath) {
			bot
				.sendDocument(chatId, documentPath)
				.then(() => {
					console.log("Dokumen berhasil dikirim.");
				})
				.catch((error) => {
					console.error("Error:", error);
				});
		}
		sendDocument(chatId, `./temp/${nameEncoded}/subtitle MIX.ass`);
	} catch (error) {
		console.error("Error:", error);
		bot.sendMessage(chatId, "Terjadi kesalahan...");
	}
};
