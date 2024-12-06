const ftp = require('basic-ftp');

async function uploadFileToFTP(localFilePath, remoteFilePath, username, userpassword) {
   const client = new ftp.Client();
   const directory = "SYJRMATOS\\";
   client.ftp.verbose = true; // debugging

   try {
      await client.access({
         host: "192.168.0.10:2222", // NAS IP
         user: `${directory}${username}`,
         password: `${userpassword}`,
         secure: false // true se SFTP, false para FTP
      });

      console.log(`Uploading ${localFilePath} to ${remoteFilePath}`);
      await client.uploadFrom(localFilePath, remoteFilePath);
   } catch (err) {
      console.error(`FTP upload failed: ${err}`);
   }
   client.close();
}

module.exports = { uploadFileToFTP };