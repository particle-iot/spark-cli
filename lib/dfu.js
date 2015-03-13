/**
 ******************************************************************************
 * @file    js/lib/dfu.js
 * @author  David Middlecamp (david@spark.io)
 * @company Spark ( https://www.spark.io/ )
 * @source https://github.com/spark/spark-cli
 * @version V1.0.0
 * @date    14-February-2014
 * @brief   DFU helper module
 ******************************************************************************
Copyright (c) 2014 Spark Labs, Inc.  All rights reserved.

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation, either
version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public
License along with this program; if not, see <http://www.gnu.org/licenses/>.
 ******************************************************************************
 */

var fs = require('fs');
var when = require('when');
var sequence = require('when/sequence');
var timing = require('./timing.js');
var utilities = require('./utilities.js');
var child_process = require('child_process');
var settings = require('../settings.js');

var that = module.exports = {

	deviceID: '1d50:607f',
	checkFor: [
		'1d50:607f'
	],

	findCompatibleDFU: function () {
		var temp = when.defer();

		var failTimer = utilities.timeoutGenerator("findCompatibleDFU timed out", temp, 6000);
		child_process.exec("dfu-util -l", function (error, stdout, stderr) {
			clearTimeout(failTimer);

			for (var i = 0; i < that.checkFor.length; i++) {
				var id = that.checkFor[i];
				if (stdout.indexOf(id) >= 0) {
					console.log("FOUND DFU DEVICE " + id);
					that.deviceID = id;
					temp.resolve();
					return;
				}
			}

			console.log("Apparently I didn't find a DFU device? util said ", stdout);
			temp.reject("no dfu device found.");
		});

		return temp.promise;
	},



	writeServerKey: function(binaryPath, leave) {
		return that.writeDfu(1, binaryPath, "0x00001000", leave);
	},
	writePrivateKey: function(binaryPath, leave) {
		return that.writeDfu(1, binaryPath, "0x00002000", leave);
	},
	writeFactoryReset: function(binaryPath, leave) {
		return that.writeDfu(1, binaryPath, "0x00020000", leave);
	},
	writeFirmware: function(binaryPath, leave) {
		return that.writeDfu(0, binaryPath, "0x08005000", leave);
	},

	readServerKey: function(dest, leave) {
		return that.readDfu(1, dest, "0x00001000:2048", leave);
	},
	readPrivateKey: function(dest, leave) {
		return that.readDfu(1, dest, "0x00002000:1024", leave);
	},
	readFactoryReset: function(dest, leave) {
		return that.readDfu(1, dest, "0x00020000", leave);
	},
	readFirmware: function(dest, leave) {
		return that.readDfu(0, dest, "0x08005000", leave);
	},

	isDfuUtilInstalled: function() {
		var cmd = "dfu-util -l";
		var installCheck = utilities.deferredChildProcess(cmd);
		return utilities.replaceDfdResults(installCheck, "Installed", "dfu-util is not installed");
	},

	readDfu: function (memoryInterface, destination, firmwareAddress, leave) {
		var prefix = that.getCommandPrefix();
		var leaveStr = (leave) ? ":leave" : "";
		var cmd = prefix + ' -a ' + memoryInterface + ' -s ' + firmwareAddress + leaveStr + ' -U ' + destination;

		return utilities.deferredChildProcess(cmd);
	},

	writeDfu: function (memoryInterface, binaryPath, firmwareAddress, leave) {
		//var prefix = that.getCommandPrefix();
		var leaveStr = (leave) ? ":leave" : "";
		//var cmd = ' -a ' + memoryInterface + ' -i 0 -s ' + firmwareAddress + leaveStr + ' -D ' + binaryPath;
		that.checkBinaryAlignment("-D " + binaryPath);

		//more robust way to protect against weird escape sequences in arguments / filenames
		var args = [
			"-d", "1d50:607f",
			"-a", memoryInterface,
			"-i", "0",
			"-s", firmwareAddress + leaveStr,
			"-D", binaryPath
		];

		//cmd = "/usr/local/bin/" + cmd;
		return utilities.deferredSpawnProcess("dfu-util", args);
	},


//    writeDfu: function (memoryInterface, binaryPath, firmwareAddress, leave) {
//        console.log('programOverDFU');
//
//        var tryProgrammingOverUsb = function () {
//            var temp = when.defer();
//            try {
//                var failTimer = setTimeout(function () {
//                    //if we don't hear back from the core in some reasonable amount of time, fail.
//                    temp.reject("programOverDFU: never heard back?");
//                }, 20000);
//
//                var prefix = that.getCommandPrefix();
//                var leaveStr = (leave) ? ":leave" : "";
//
//                var cmd = prefix + ' -a ' + memoryInterface + ' -s ' + firmwareAddress + leaveStr + ' -D ' + binaryPath;
//                that.checkBinaryAlignment(cmd);
//
//                console.log("programOverDFU running: " + cmd);
//                child_process.exec(cmd, function (error, stdout, stderr) {
//                    clearTimeout(failTimer);
//
//                    console.log("programOverDFU dfu done !", error, stdout, stderr);
//
//                    if (error) {
//                        temp.reject("programOverDFU: " + error);
//                        console.log("programOverDFU stdout: " + stdout);
//                        console.log("programOverDFU stderr: " + stderr);
//                    }
//                    else {
//                        console.log("programOverDFU success!");
//                        temp.resolve();
//                    }
//                });
//            }
//            catch (ex) {
//                console.error("programOverDFU error: " + ex);
//                temp.reject("programOverDFU error: " + ex);
//            }
//
//            return temp.promise;
//        };
//
//        var promise = sequence([
//            that.findCompatibleDFU,
//            timing.helpers.waitHalfSecond,
//            tryProgrammingOverUsb
//        ]);
//
//        return promise;
//    },


	getCommandPrefix: function () {
		var sudo = (settings.useSudoForDfu) ? "sudo " : "";
		return sudo + "dfu-util -d " + that.deviceID;
	},

	checkBinaryAlignment: function (cmdargs) {
		var idx = cmdargs.indexOf('-D ');
		if (idx >= 0) {
			var filepath = cmdargs.substr(idx + 3);
			console.log('checking file ', filepath);
			that.appendToEvenBytes(filepath);
		}
		else {
			console.log('uhh, args had no path.');
		}
	},

	/**
	 *
	 * @param filepath
	 */
	appendToEvenBytes: function (filepath) {
		if (fs.existsSync(filepath)) {
			var stats = fs.statSync(filepath);

			//is the filesize even?
			//console.log(filepath, ' stats are ', stats);
			if ((stats.size % 2) != 0) {
				var buf = new Buffer(1);
				buf[0] = 0;

				fs.appendFileSync(filepath, buf);
			}
		}
	},

	_: null
};
