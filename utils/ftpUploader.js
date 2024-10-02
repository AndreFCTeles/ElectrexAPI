const ftp = require('basic-ftp');

async function uploadFileToFTP(localFilePath, remoteFilePath) {
   const client = new ftp.Client();
   client.ftp.verbose = true; // Optional, for debugging

   try {
      await client.access({
         host: "192.168.0.10:80", // NAS IP
         user: "yourFtpUsername",
         password: "yourFtpPassword",
         secure: false // or true if you're using FTPS
      });

      console.log(`Uploading ${localFilePath} to ${remoteFilePath}`);
      await client.uploadFrom(localFilePath, remoteFilePath);
   } catch (err) {
      console.error(`FTP upload failed: ${err}`);
   }
   client.close();
}

module.exports = { uploadFileToFTP };