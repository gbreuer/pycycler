import sys
from read_fcs import FCSFile
from histogram_analysis import refined_analysis
import json
import pandas as pd
import zerorpc

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
	sys.stdout.flush()
	sys.stderr.flush()

def check_file(filename):
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

	#except:
	#	stdout.append(1)
	#	stdout.append(filename)

	print(json.dumps(stdout))
	sys.stdout.flush()
	sys.stderr.flush()

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

	print(json.dumps(stdout))
	sys.stdout.flush()
	sys.stderr.flush()

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
	print(json.dumps(stdout))
	sys.stdout.flush()
	sys.stderr.flush()

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

	print(json.dumps(stdout))
	sys.stdout.flush()
	sys.stderr.flush()

class CyclerServer(object):
	def run(self, arguments):
		if sys.argv[1] == 'check_file':
			check_file(arguments)

		elif sys.argv[1] == 'get_data':
			get_data(arguments)

		elif sys.argv[1] == 'get_preview':
			get_data(arguments)

		elif sys.argv[1] == 'run_analysis':
			run_analysis(arguments)

		elif sys.argv[1] == 'load_all_files':
			load_all_files(arguments)


if __name__ == '__main__':
	server = zerorpc.Server(CyclerServer())
	server.bind("tcp://0.0.0.0:4242")
	server.run()
