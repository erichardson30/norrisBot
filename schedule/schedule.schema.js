var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var ScheduleSchema = new Schema({
    real_name : String,
    userName : String,
    email : String,
    userId : String,
    date : Date,
    channel: String,
    expecting : String
});

// Return the model
module.exports = mongoose.model('Schedules', ScheduleSchema);
