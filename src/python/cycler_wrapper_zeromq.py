import sys
from read_fcs import FCSFile
from histogram_analysis import refined_analysis
import json
import pandas as pd
import zmq
import time

def load_all_files(options):
	stdout = []
	data = []

	property_name = options[2]
	output_filename = options[3]
	filenames = options[4:]

	data_dict = {}

	for filename in filenames:
		if (filename[-3:] == 'fcs'):
			file = FCSFile()

			file.load_file(filename)
			file_data = file.get_data_by_name(property_name)

		elif (filename[-3:] == 'csv'):
			df = pd.read_csv(filename)
			file_data = list(df[property_name])

		data_dict[filename] = file_data

	#return dict and average dict
	with open(output_filename, 'w') as f:
		f.write(json.dumps(data_dict))
		print("Data written to "+output_filename)

	return [output_filename]

def check_file(options):
	filename = options[2]
	stdout = []

	if (filename[-3:] == 'fcs'):
		file = FCSFile()
		file.load_file(filename)
		stdout.append(0)
		stdout.append(filename)
		stdout.append(file.get_params())

	elif (filename[-3:] == 'csv'):
		df = pd.read_csv(filename)
		stdout.append(0)
		stdout.append(filename)
		stdout.append(list(df.columns))

	return stdout

def get_data(options):
	stdout = []
	property_name = options[2]

	filename = options[3]

	if (filename[-3:] == 'fcs'):
		file = FCSFile()
		file.load_file(filename)
		file_data = file.get_data_by_name(property_name)

	elif (filename[-3:] == 'csv'):
		df = pd.read_csv(filename)
		file_data = list(df[property_name])

	stdout = file_data

	return stdout

def get_preview(options):
	stdout = []
	data = []

	property_name = options[2]

	filenames = options[3:]

	for filename in filenames:
		if (filename[-3:] == 'fcs'):
			file = FCSFile()

			file.load_file(filename)
			file_data = file.get_data_by_name(property_name)

		elif (filename[-3:] == 'csv'):
			df = pd.read_csv(filename)
			file_data = list(df[property_name])

		data += file_data

	if len(data) > 5000:
		new_data = []
		for i in range(5000):
			new_data.append(data[int(random()*len(data))])

		data = new_data

	stdout += data
	return stdout

def run_analysis(options):
	stdout = []
	data = []

	property_name = options[2]

	g1_guess = float(options[3])
	g2_guess = float(options[4])
	low_lim = float(options[5])
	high_lim = float(options[6])

	filename = options[7]
	with open(options[8], 'r') as f:
		file_data = json.loads(f.read())

	img_filename = None
	if len(options) == 10:
		img_filename = options[9]

	stdout.append(filename)
	if (len(options) == 11):
		analysis_std = float(options[10])
		stdout.append(refined_analysis(file_data, low_lim, high_lim, g1_guess, g2_guess, stdev=analysis_std, output_filename=img_filename))
	else:
		stdout.append(refined_analysis(file_data, low_lim, high_lim, g1_guess, g2_guess, output_filename=img_filename))

	return stdout

if __name__ == '__main__':
	context = zmq.Context()
	socket = context.socket(zmq.REP)
	socket.bind("tcp://127.0.0.1:4242")

	while True:
		message = socket.recv()
		message = json.loads(message)
		print(message)
		ret = json.dumps(["OK","Ready"])

		if message:
			method = message[0]
			args = ['']+message

			if method == 'check_file':
				ret = json.dumps(['check_file',check_file(args)])

			elif method == 'get_data':
				ret = json.dumps(['get_data',get_data(args)])

			elif method == 'get_preview':
				ret = json.dumps(['get_preview',get_data(args)])

			elif method == 'run_analysis':
				ret = json.dumps(['run_analysis',run_analysis(args)])

			elif method == 'load_all_files':
				ret = json.dumps(['load_all_files',load_all_files(args)])

		socket.send_string(ret)

		time.sleep(0.5)
