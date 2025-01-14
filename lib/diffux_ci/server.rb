require 'sinatra/base'
require 'yaml'

module DiffuxCI
  class Server < Sinatra::Base
    configure do
      enable :static
      set :port, DiffuxCI::Utils.config['port']
    end

    helpers do
      def h(text)
        Rack::Utils.escape_html(text)
      end
    end

    get '/' do
      @config = DiffuxCI::Utils.config
      erb :index
    end

    get '/debug' do
      @config = DiffuxCI::Utils.config
      erb :debug
    end

    get '/review' do
      @snapshots = DiffuxCI::Utils.current_snapshots
      erb :review
    end

    get '/resource' do
      file = params[:file]
      if file.start_with? 'http'
        redirect file
      else
        send_file file
      end
    end

    post '/reject' do
      DiffuxCI::Action.new(params[:description], params[:viewport]).reject
      redirect back
    end

    post '/approve' do
      DiffuxCI::Action.new(params[:description], params[:viewport]).approve
      redirect back
    end

    run!
  end
end
