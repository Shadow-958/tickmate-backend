const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

console.log('Cloudinary cloud_name:', process.env.CLOUDINARY_CLOUD_NAME);


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'event-platform',
        allowedFormats: ["png", "jpg", "jpeg", "webp"],
        transformation: [{ width: 1200, height: 400, crop: 'fill' }]
    }
});

module.exports = {
    cloudinary,
    storage
};